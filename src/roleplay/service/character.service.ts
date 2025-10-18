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

/**
 * @todo: [MED]: Use explicit caching for chat info ant conversations,
 * they rarely update (every 6 hrs)
 */
@Injectable()
export class CharacterService {
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
    const config = await this.configService.getConfig(chatId);

    const users = await this.userService.getActiveUsersInChat(chatId, 50);
    const message = await this.messageService.getMessage(chatId, messageId);

    let answerStrategy: AnswerStrategyEntity =
      await this.answerStrategyService.solveChatStrategy(
        chatId,
        messageId,
        text,
        users
      );

    if (!answerStrategy) {
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
      answerStrategy.quality
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
        this.collectCurrentConversationContext(chatId, messageId),
        this.promptService.getPromptFromChatCharacter(chatId),
        this.promptService.getPromptForCommands(),
        this.promptService.getPromptForUsersParticipants(users),
        this.promptService.getPromptFromConversations(pastConversationsContext),
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
        ...promptThreadChain
      );

      const count = await this.geminiService.getTokenCount(
        answerStrategy.quality,
        promptList
      );
      const worthCaching = count > 10000;

      if (worthCaching) {
        cache = await this.geminiCacheService.createChatCache(
          chatId,
          answerStrategy.quality,
          config.characterSystemPrompt,
          promptList,
          [
            currentConversationContext[0].messageId,
            currentConversationContext[currentConversationContext.length - 1]
              .messageId,
          ],
          config.canGoogle
        );

        promptList = [];
      }
    } else {
      const currentConversationContext =
        await this.collectCurrentConversationContext(
          chatId,
          messageId,
          cache.endMessageId
        );

      const promptThreadChain: Array<Content> =
        this.promptService.getPromptFromMessages(
          currentConversationContext,
          users
        );

      promptList.push(...promptThreadChain);
    }

    promptList.push(...(await this.promptService.getSituationalPrompt(users)));

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
      return this.fallback();
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
  }

  public async rephrase(
    chatId: number,
    text: string,
    toUser?: UserDocument
  ): Promise<string> {
    const chatConfig = await this.configService.getConfig(chatId);

    const [
      characterPrompt,
      commandsPrompt,
      participantsPrompt,
      rephrasePrompt,
    ] = await Promise.all([
      this.promptService.getPromptFromChatCharacter(chatId),
      this.promptService.getPromptForCommands(),
      toUser ? this.promptService.getPromptForUsersParticipants([toUser]) : [],
      this.promptService.getPromptForRephrase(text, toUser),
    ]);

    const promptList: Array<Content> = [
      ...characterPrompt,
      ...commandsPrompt,
      ...participantsPrompt,
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
  }

  /**
   * @todo: [HIGH] having N last messages *breaks the cache*
   * It is much more efficient for LLM to cache shit ton of messages
   * since last summarization than try to narrow down the context,
   * especially with Gemini that can do 1M tokens (that's like 35 000 000 chars).
   * Better done with explicit cache, but implicit will work if we do
   * "messages since" and do much more rough time rounding for past messages
   * We also need to remove current time and for that rewrite prompt.
   * @param chatId
   * @param messageId
   * @param fromMessageId
   * @private
   */
  private async collectCurrentConversationContext(
    chatId: number,
    messageId: number,
    fromMessageId?: number
  ): Promise<Array<MessageDocumentWithChain>> {
    const [pastMessages, chain]: [
      Array<MessageDocument>,
      Array<MessageDocumentWithChain>
    ] = await Promise.all([
      this.messageService.getUnprocessedMessages(chatId, fromMessageId, 10000),
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

    combinedMessages.sort((a, b) => b.date.getTime() - a.date.getTime());

    return combinedMessages;
  }

  private async fallback(): Promise<string> {
    return "What you said is so dumb that I couldn't answer without triggering safety filters, of which I have none. Please shut up.";
  }
}
