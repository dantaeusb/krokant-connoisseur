import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@core/service/config.service";
import { UserDocument } from "@core/entity/user.entity";
import { MessageService } from "@core/service/message.service";
import { Content } from "@google/genai";
import { MessageDocument } from "@core/entity/message.entity";
import { UserService } from "@core/service/user.service";
import { GeminiService } from "@genai/service/gemini.service";
import { GeminiCacheService } from "@genai/service/gemini-cache.service";
import { ConversationService } from "./conversation.service";
import { PromptService } from "./prompt.service";
import { AnswerStrategyService } from "./answer-strategy.service";
import {
  AnswerStrategyEntity,
  HARDCODED_STRATEGY_CODE_IGNORE,
  HARDCODED_STRATEGY_CONVERSATION,
} from "../entity/answer-strategy.entity";
import { MessageDocumentWithChain } from "../type/message-with-chain";
import { ModelQualityType } from "@genai/types/model-quality.type";
import { CONTEXT_WINDOW_MESSAGES_LIMIT } from "@roleplay/const/context-window.const";

/**
 * @todo: [MED] Re-cache if more than X new tokens since last cache
 * @todo: [HIGH] Similar to answer strategy, have context strategy that
 * decides how much context to provide based on answer needs.
 */
@Injectable()
export class CharacterService {
  private static readonly MINIMAL_CACHING_TOKENS = 15000;
  private static readonly MINIMAL_RECACHE_TRIGGER_TOKENS = 25000;

  private logger = new Logger("Roleplay/CharacterService");

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly geminiCacheService: GeminiCacheService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly conversationService: ConversationService,
    private readonly answerStrategyService: AnswerStrategyService,
    private readonly promptService: PromptService
  ) {}

  public async respond(
    chatId: number,
    messageId: number,
    text: string,
    toUser?: UserDocument
  ): Promise<string> {
    try {
      const config = await this.configService.getConfig(chatId);

      const users = await this.userService.getActiveUsersInChat(chatId, 50);
      const message = await this.messageService.getMessage(chatId, messageId);

      let answerStrategy: AnswerStrategyEntity | null = null;
      let chatContextRequired = false;

      // eslint-disable-next-line prefer-const
      const answerStrategyResponse =
        await this.answerStrategyService.solveChatStrategy(
          chatId,
          messageId,
          text,
          users
        );

      //this.solveChatContext(chatId, messageId, text, users),

      // @todo: [HIGH] Refactor chatContextRequired
      if (
        !!answerStrategyResponse ||
        answerStrategyResponse.strategies.length > 0
      ) {
        const strategy = answerStrategyResponse.strategies.sort(
          (a, b) => b.weight - a.weight
        );

        chatContextRequired = answerStrategyResponse.needExtraContext;

        const answerStrategyDocument =
          await this.answerStrategyService.getStrategy(
            chatId,
            strategy[0].strategy
          );

        answerStrategy = answerStrategyDocument.toObject();
      } else {
        this.logger.error(
          "No answer strategy could be determined. Using fallback strategy."
        );
      }

      if (answerStrategy === null) {
        this.logger.error(
          "No answer strategy could be determined. Using fallback strategy."
        );

        answerStrategy = {
          chatId,
          ...HARDCODED_STRATEGY_CONVERSATION,
        };
      }

      if (answerStrategy.strategyCode === HARDCODED_STRATEGY_CODE_IGNORE) {
        this.logger.log(
          "Bot chose to ignore the message based on the answer strategy."
        );
        return "";
      }

      let cache = await this.geminiCacheService.getChatCache(
        chatId,
        answerStrategy.quality,
        chatContextRequired ? "extended" : "short"
      );

      let promptList: Array<Content> = [];

      if (!cache) {
        const pastConversationsContext =
          await this.conversationService.getConversations(chatId);

        const [
          currentConversationContext,
          characterPrompt,
          commandsPrompt,
          participantsPrompt,
          pastConversationsPrompt,
          replyPrompt,
        ] = await Promise.all([
          chatContextRequired
            ? this.collectConversationContext(chatId, messageId)
            : [],
          this.promptService.getPromptFromChatCharacter(chatId),
          this.promptService.getPromptForCommands(),
          this.promptService.getPromptForUsersParticipants(users),
          this.promptService.getPromptFromConversations(
            pastConversationsContext,
            chatContextRequired ? 100 : 30,
            chatContextRequired ? 500 : 70
          ),
          this.promptService.getPromptForReply(toUser),
        ]);

        const promptThreadChain: Array<Content> =
          this.promptService.getPromptFromMessages(
            currentConversationContext,
            users
          );

        promptList.push(
          ...characterPrompt,
          ...commandsPrompt,
          ...participantsPrompt,
          ...pastConversationsPrompt,
          ...replyPrompt,
          {
            role: "user",
            parts: [
              {
                text: "***\n\nThose are all the previous messages from this chat that were not summarized yet. After that, you will be provided with current messages and a task below.\n\n",
              },
            ],
          },
          ...promptThreadChain
        );

        const count = await this.geminiService.getTokenCount(
          answerStrategy.quality,
          promptList
        );
        const worthCaching = count > CharacterService.MINIMAL_CACHING_TOKENS;

        if (worthCaching) {
          cache = await this.geminiCacheService.createChatCache(
            chatId,
            answerStrategy.quality,
            chatContextRequired ? "extended" : "short",
            config.characterSystemPrompt,
            promptList,
            chatContextRequired
              ? [
                  currentConversationContext[0].messageId,
                  currentConversationContext[
                    currentConversationContext.length - 1
                  ].messageId,
                ]
              : undefined,
            config.canGoogle
          );

          promptList = [];
        }
      } else {
        const currentConversationContext =
          await this.collectConversationContext(
            chatId,
            messageId,
            chatContextRequired
              ? CONTEXT_WINDOW_MESSAGES_LIMIT.extended
              : CONTEXT_WINDOW_MESSAGES_LIMIT.short,
            cache.endMessageId
          );

        const promptThreadChain: Array<Content> =
          this.promptService.getPromptFromMessages(
            currentConversationContext,
            users
          );

        promptList.push(...promptThreadChain);
      }

      promptList.push(
        {
          role: "user",
          parts: [
            {
              text: "***\n\nThose are all the messages from the chat. You will be provided with current information and a task below.\n\n",
            },
          ],
        },
        ...(await this.promptService.getSituationalPrompt(users))
      );

      promptList.push({
        role: "user",
        parts: [{ text: answerStrategy.strategyPrompt + "\n\n" }],
      });

      const replyToMessage = message.replyToMessageId
        ? await this.messageService.getMessage(chatId, message.replyToMessageId)
        : null;

      let replyToUser: UserDocument;
      if (replyToMessage) {
        replyToUser = users.find((u) => u.userId === replyToMessage.userId);
      }

      promptList.push({
        role: "user",
        parts: [
          {
            text: this.promptService.formatMessageContent(
              message,
              toUser,
              replyToUser,
              true
            ),
          },
        ],
      });

      const candidate = await this.geminiService.generate(
        answerStrategy.quality,
        promptList,
        config.characterSystemPrompt,
        config.canGoogle,
        cache ? cache.name : undefined
      );

      if (!candidate) {
        this.logger.log("No candidate generated by model.");
        return "";
      }

      let answer = candidate.content.parts.map((part) => part.text).join("\n");
      answer = answer.replace(/^>+/g, "");

      if (candidate.groundingMetadata?.webSearchQueries) {
        answer += `\n\n(Searched Google for: ${candidate.groundingMetadata.webSearchQueries
          .map((query) => {
            return `"[${query}](https://www.google.com/search?q=${encodeURIComponent(
              query
            )})"`;
          })
          .join(", ")})`;
      }

      return answer;
    } catch (error) {
      this.logger.error(
        `Failed to respond to message in chatId=${chatId}, messageId=${messageId}: ${error.message}`,
        error
      );

      return "";
    }
  }

  public async rephrase(
    chatId: number,
    messageId: number,
    text: string,
    toUser?: UserDocument
  ): Promise<string> {
    try {
      const chatConfig = await this.configService.getConfig(chatId);

      const [
        users,
        currentConversationContext,
        characterPrompt,
        commandsPrompt,
        participantsPrompt,
        rephrasePrompt,
      ] = await Promise.all([
        this.userService.getActiveUsersInChat(chatId, 5),
        this.collectConversationContext(chatId, messageId, 30),
        this.promptService.getPromptFromChatCharacter(chatId),
        this.promptService.getPromptForCommands(),
        toUser
          ? this.promptService.getPromptForUsersParticipants([toUser])
          : [],
        this.promptService.getPromptForRephrase(text, toUser),
      ]);

      const promptThreadChain: Array<Content> =
        this.promptService.getPromptFromMessages(
          currentConversationContext,
          users
        );

      const promptList: Array<Content> = [
        ...characterPrompt,
        ...commandsPrompt,
        ...participantsPrompt,
        {
          role: "user",
          parts: [
            {
              text: "***\n\nThose are all the previous messages from this chat that were not summarized yet. After that, you will be provided with current messages and a task below.\n\n",
            },
          ],
        },
        ...promptThreadChain,
        ...rephrasePrompt,
      ];

      const candidate = await this.geminiService.generate(
        "low",
        promptList,
        chatConfig.characterSystemPrompt
      );

      if (!candidate) {
        return text;
      }

      let answer = candidate.content.parts.map((part) => part.text).join("\n");
      answer = answer.replace(/^>+/g, "");

      return answer;
    } catch (error) {
      this.logger.error(
        `Failed to rephrase message in chatId=${chatId}, messageId=${messageId}: ${error.message}`,
        error
      );
      return text;
    }
  }

  public async reloadCacheForChat(
    chatId: number,
    quality?: ModelQualityType
  ): Promise<void> {
    if (!quality) {
      const qualities: Array<ModelQualityType> = ["low", "regular", "advanced"];
      for (const q of qualities) {
        await this.geminiCacheService.deleteChatCache(chatId, q);
      }
      return;
    }
    await this.geminiCacheService.deleteChatCache(chatId, quality);
  }

  /**
   * It is much more efficient for LLM to cache shit ton of messages
   * since last summarization than try to narrow down the context,
   * especially with Gemini that can do 1M tokens (that's like 35 000 000 chars).
   * Better done with explicit cache, but implicit will work if we do
   * "messages since" and do much more rough time rounding for past messages
   * We also need to remove current time and for that rewrite prompt.
   * @param chatId
   * @param messageId
   * @param limit
   * @param fromMessageId
   * @private
   */
  private async collectConversationContext(
    chatId: number,
    messageId: number,
    limit = 10000,
    fromMessageId?: number
  ): Promise<Array<MessageDocumentWithChain>> {
    const [pastMessages, chain]: [
      Array<MessageDocument>,
      Array<MessageDocumentWithChain>
    ] = await Promise.all([
      this.messageService.getUnprocessedMessages(chatId, limit, fromMessageId),
      this.messageService.getMessageChain(chatId, messageId),
    ]);

    chain.forEach((message) => {
      message.isInChain = true;
    });

    const messageMap = new Map<number, MessageDocumentWithChain>();

    for (const message of chain) {
      if (!messageMap.has(message.messageId)) {
        messageMap.set(message.messageId, message);
      }
    }

    for (const message of pastMessages) {
      if (!messageMap.has(message.messageId)) {
        messageMap.set(message.messageId, message);
      }
    }

    const combinedMessages = Array.from(messageMap.values());

    combinedMessages.sort((a, b) => a.date.getTime() - b.date.getTime());

    return combinedMessages;
  }
}
