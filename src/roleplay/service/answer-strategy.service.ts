import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@core/service/config.service";
import {
  AnswerStrategyDocument,
  AnswerStrategyEntity,
  HARDCODED_STRATEGY_CODE_CONVERSATION,
  HARDCODED_STRATEGY_CONVERSATION,
  HARDCODED_STRATEGY_IGNORE,
} from "@roleplay/entity/answer-strategy.entity";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { GeminiService } from "@genai/service/gemini.service";
import { PromptService } from "@roleplay/service/prompt.service";
import { MessageDocument } from "@core/entity/message.entity";
import { MessageDocumentWithChain } from "@roleplay/type/message-with-chain";
import { Content } from "@google/genai";
import { UserDocument } from "@core/entity/user.entity";

@Injectable()
export class AnswerStrategyService implements OnModuleInit {
  private static readonly MAX_WINDOW_MESSAGES = 100;

  private logger = new Logger("Roleplay/AnswerStrategyService");

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly promptService: PromptService
  ) {}

  onModuleInit() {
    this.ensureChatStrategies()
      .then(() => this.logger.log("Chat strategies ensured."))
      .catch((error) =>
        this.logger.error(
          "Error during AnswerStrategyService initialization:",
          error
        )
      );
  }

  /**
   * Ensure answer strategies are set up for the given chat.
   * If chatId is not provided, update all chats.
   *
   * @param chatId
   */
  public async ensureChatStrategies(chatId?: number): Promise<void> {
    if (chatId === undefined) {
      this.logger.debug(
        "No chatId provided, ensuring strategies for all chats."
      );

      let chatIds = [0, ...(await this.configService.getAllChatIds())];
      chatIds = chatIds.filter((id) => id !== undefined && id !== null);

      await Promise.all(
        chatIds.map(async (chatId) => {
          await this.ensureChatStrategies(chatId);
        })
      );

      return;
    }

    const config = await this.configService.getConfig(chatId);

    if (!config) {
      this.logger.warn(`No configuration found for chatId=${chatId}`);
      return;
    }

    if (!config.answerStrategies || config.answerStrategies.length === 0) {
      this.logger.debug(
        `No answer strategies found for chatId=${chatId}, setting up defaults.`
      );

      const defaultStrategies: Array<AnswerStrategyEntity> = [
        {
          chatId,
          ...HARDCODED_STRATEGY_CONVERSATION,
        },
        {
          chatId,
          strategyCode: "question",
          quality: "regular",
          strategyClassificationDescription:
            "The message has a question that does not seem very important, but could spark a conversation.",
          strategyPrompt:
            "Answer the following message briefly, just in a few sentences. " +
            "Stick to the role you're playing, and pay attention to the conversation context " +
            "and user's personalities. " +
            "Be creative and engaging in your response to encourage further discussion.",
        },
        {
          // @todo: [MID]: Create feedback tool to process feedback messages properly
          chatId,
          strategyCode: "feedback",
          quality: "regular",
          strategyClassificationDescription:
            "The message is providing feedback, opinions, or suggestions.",
          strategyPrompt:
            "Respond to the feedback or opinion expressed in the message. " +
            "Acknowledge the user's input and provide a thoughtful response. " +
            "If the the feedback requires action, better use other strategies or tools to handle it.",
        },
        {
          chatId,
          strategyCode: "research",
          quality: "advanced",
          strategyClassificationDescription:
            "The message requires gathering information from various sources to provide a well-informed response. " +
            "Use this when user is genuinely seeking detailed information, when topic requires nuance, " +
            "or when user is asking for comparisons or analyses.",
          strategyPrompt:
            "The message requires gathering information from various sources to provide a well-informed response. " +
            "Use your tools to research the topic thoroughly before answering. " +
            "Provide a detailed and accurate response based on your findings. " +
            "If you cannot find sufficient information, clearly state that in your response. " +
            "Tone down the roleplay for the answer to keep it concise.",
        },
        {
          chatId,
          strategyCode: "annoyance",
          quality: "regular",
          strategyClassificationDescription:
            "The message is annoying, provocative, or disruptive.",
          strategyPrompt:
            "According to your role, respond to the message in a way that " +
            "de-escalates the situation and discourages further disruptive behavior. " +
            "You may choose to ignore the message, provide a neutral response, " +
            "or remind the user of appropriate chat conduct.",
        },
        {
          chatId,
          strategyCode: "overloaded",
          quality: "regular",
          strategyClassificationDescription:
            "Use this when chat is overflown with your messages.",
          strategyPrompt:
            "According to your role, encourage users to interact more among themselves " +
            "by denying the answer or providing uninterested response " +
            "to reduce the number of your messages in the chat.",
        },
        {
          chatId,
          ...HARDCODED_STRATEGY_IGNORE,
        },
      ];

      config.answerStrategies.push(...defaultStrategies);

      await config.save();

      this.logger.debug(`Default answer strategies set for chatId=${chatId}.`);
    }
  }

  /*
   * Chat interaction methods
   */

  /**
   * Solve and return the best answer strategy for the given chat and message.
   * Will use short-term no-cached context and quick model to classify the message.
   * @param chatId
   * @param messageId
   * @param message
   * @param users
   */
  public async solveChatStrategy(
    chatId: number,
    messageId: number,
    message: string,
    users?: Array<UserDocument>
  ): Promise<AnswerStrategyDocument | null> {
    this.logger.debug(
      `Solving strategy for chatId=${chatId} with message="${message}"`
    );

    const config = await this.configService.getConfig(chatId);

    const { strategyCodes, descriptions } =
      await this.getChatStrategyClassificationRequest(chatId);

    const currentConversationContext =
      await this.collectCurrentConversationContext(chatId, messageId);

    if (!users) {
      users = await this.userService.getParticipants(
        chatId,
        currentConversationContext
      );
    }

    const [characterPrompt, participantsPrompt] = await Promise.all([
      this.promptService.getPromptFromChatCharacter(chatId),
      this.promptService.getPromptForUsersParticipants(users),
    ]);

    const contents: Array<Content> = [
      ...characterPrompt,
      ...participantsPrompt,
      ...this.promptService.getPromptFromMessages(
        currentConversationContext.reverse(),
        users,
        false
      ),
      {
        role: "user",
        parts: [
          {
            text:
              "Classify the best possible strategy to respond to the following message:\n" +
              `"${message}"`,
          },
        ],
      },
    ];

    const result = await this.geminiService.quickClassify(
      contents,
      strategyCodes,
      descriptions,
      config.answerStrategySystemPrompt
    );

    this.logger.debug(
      `Strategy classification result for chatId=${chatId}: ${result}`
    );

    return await this.getStrategy(chatId, result);
  }

  /*
   * Model interaction methods
   */
  public async getChatStrategies(
    chatId: number
  ): Promise<Array<AnswerStrategyDocument>> {
    const config = await this.configService.getConfig(chatId);

    return config.answerStrategies;
  }

  public async getChatStrategyClassificationRequest(
    chatId: number
  ): Promise<StrategyResponse> {
    const strategy = await this.getChatStrategies(chatId);

    const descriptions = strategy
      .map((s) => `- ${s.strategyCode}: ${s.strategyClassificationDescription}`)
      .join("\n");

    return {
      strategyCodes: strategy.map((s) => s.strategyCode),
      descriptions: descriptions,
    };
  }

  public async getStrategy(
    chatId: number,
    strategyCode: string
  ): Promise<AnswerStrategyDocument | null> {
    const strategies = await this.getChatStrategies(chatId);

    const requiredStrategy =
      strategies.find((s) => s.strategyCode === strategyCode) || null;

    if (requiredStrategy) {
      return requiredStrategy;
    }

    this.logger.warn(
      `Strategy with code=${strategyCode} not found for chatId=${chatId}`
    );

    return (
      strategies.find(
        (s) => s.strategyCode === HARDCODED_STRATEGY_CODE_CONVERSATION
      ) || null
    );
  }

  /*
   * Utilities
   */

  /**
   * Short-term context collection for strategy classification
   * @param chatId
   * @param messageId
   * @private
   */
  private async collectCurrentConversationContext(
    chatId: number,
    messageId: number
  ): Promise<Array<MessageDocument>> {
    const [pastMessages, chain]: [
      Array<MessageDocument>,
      Array<MessageDocumentWithChain>
    ] = await Promise.all([
      this.messageService.getLatestMessages(
        chatId,
        AnswerStrategyService.MAX_WINDOW_MESSAGES
      ),
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
}

type StrategyResponse = {
  strategyCodes: Array<string>;
  descriptions: string;
};
