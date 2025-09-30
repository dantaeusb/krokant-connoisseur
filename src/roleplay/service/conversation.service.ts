import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { GeminiService } from "@genai/service/gemini.service";
import { ConfigService } from "@core/service/config.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { PersonService } from "@roleplay/service/person.service";
import { MessageDocument } from "@core/entity/message.entity";
import { Content, Schema as GenAiOpenApiSchema, Type } from "@google/genai";
import { PromptService } from "@roleplay/service/prompt.service";
import { UserDocument } from "@core/entity/user.entity";
import {
  ConversationDocument,
  ConversationEntity,
} from "@roleplay/entity/conversation.entity";

import { CounterService } from "@core/service/counter.service";

type SummarizationResponse = {
  conversations: Array<{
    summary: string;
    messageStart: string;
    messageEnd: string;
    participants: Array<{
      handle: string;
      attitude: {
        hostility: number;
        repetitiveness: number;
        engagement: number;
        kindness: number;
        playfulness: number;
      };
      facts?: Array<string>;
    }>;
  }>;
};

@Injectable()
export class ConversationService {
  private static MAX_CONVERSATION_GAP_MS = 1000 * 60 * 60 * 4; // 4 hours

  private logger: Logger = new Logger("Roleplay/ConversationService");

  constructor(
    @InjectModel(ConversationEntity.COLLECTION_NAME)
    private readonly conversationEntityModel: Model<ConversationEntity>,
    private readonly configService: ConfigService,
    private readonly counterService: CounterService,
    private readonly geminiService: GeminiService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly personService: PersonService,
    private readonly promptService: PromptService
  ) {}

  public async processOldestUnprocessedConversation(
    chatId: number,
    characterCountLimit = 50000
  ): Promise<ConversationDocument | null> {
    const messages = await this.getOldestUnprocessedConversationMessages(
      chatId,
      characterCountLimit
    );

    if (messages.length === 0) {
      this.logger.log(`No unprocessed messages found for chat ${chatId}`);
      return null;
    }

    const config = await this.configService.getConfig(chatId);
    const users = await this.userService.getParticipants(chatId, messages);

    const promptList: Array<Content> = [
      {
        role: "user",
        parts: [
          {
            text:
              `You are analyzing a chat log from a cluster of messages.\n` +
              `Messages are starting with #Message ID: [User Handle] (Time)\n` +
              `If message says that it's hidden by user preferences, avoid ` +
              `extracting any information about it from context from other users.\n`,
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            text:
              `Following is how your role described in the chat, ` +
              `you can use it for better characterization and fact extraction ` +
              `act as if :\n` +
              config.characterPrompt,
          },
        ],
      },
    ];

    const messagesPrompt = this.promptService.getPromptFromMessages(
      messages,
      users,
      true,
      true
    );

    this.logger.debug(messagesPrompt);

    const response: SummarizationResponse =
      await this.geminiService.summarizeAndRate(
        [...promptList, ...messagesPrompt],
        this.summarizationSchema,
        `${config.summarizerSystemPrompt}`
      );

    this.logger.log(response);

    for (const conversation of response.conversations) {
      this.logger.log(
        `Conversation from ${conversation.messageStart} to ${conversation.messageEnd}: ` +
          conversation.summary
      );

      let participantUsers = await Promise.all(
        conversation.participants.map((participant) => {
          return this.promptService.getUserFromHandle(
            chatId,
            participant.handle,
            users
          );
        })
      );

      participantUsers = participantUsers.filter((user) => user !== null);

      const participantUserIds = participantUsers.map(
        (participant) => participant.userId
      );

      const messagesInConversation = messages.filter((message) => {
        return (
          message.messageId >= parseInt(conversation.messageEnd) &&
          message.messageId <= parseInt(conversation.messageStart)
        );
      });

      let time = messagesInConversation[0]
        ? messagesInConversation[0].createdAt
        : new Date();
      // Round to hour
      time = new Date((time.getTime() % 60) * 60 * 1000);

      const conversationId = await this.counterService.getNextSequence(
        `${ConversationEntity.COLLECTION_NAME}-${chatId}`
      );

      const newConversation = await this.conversationEntityModel.create({
        chatId,
        conversationId,
        messageStartId: parseInt(conversation.messageStart) || 0,
        messageEndId: parseInt(conversation.messageEnd) || 0,
        summary: conversation.summary,
        participantIds: participantUserIds,
        time,
      });

      await this.messageService.addConversationIdToMessages(
        chatId,
        messagesInConversation.map((message) => message.messageId),
        newConversation.conversationId
      );
    }
  }

  private async updateFactsAndThoughts(
    chatId: number,
    participantUsers: Array<UserDocument>,
    participants: Array<
      SummarizationResponse["conversations"][0]["participants"]
    >
  ): Promise<void> {
    participants.map((participantInfo) => {
      participantInfo;
    });
  }

  /**
   * Tries to find the largest gaps in the message history and split by them
   * aiming to keep no more than character target count.
   *
   * First gets some number of latest messages, then finds gaps larger than
   * MAX_CONVERSATION_GAP_MS and splits by them. If the resulting chunks are still
   * too large, it will further split them by larger gaps until the character
   * count limit is met.
   * @param chatId
   * @param characterCountLimit
   */
  public async getOldestUnprocessedConversationMessages(
    chatId: number,
    characterCountLimit = 50000
  ): Promise<Array<MessageDocument>> {
    const messages = await this.messageService.getOldestUnprocessedMessages(
      chatId,
      Math.round(characterCountLimit / 40)
    );

    const mappedMessages: Map<number, MessageDocument> = new Map();
    messages.forEach((message) =>
      mappedMessages.set(message.messageId, message)
    );

    const users = await this.userService.getParticipants(chatId, messages);
    const mappedUsers: Map<number, UserDocument> = new Map();
    users.forEach((user) => mappedUsers.set(user.userId, user));

    // For every gap larger than MIN_GAP_MS we will log the message IDs
    // and gap duration in milliseconds.
    const messageIdGaps: Array<[number, number]> = [];

    let lastMessageDate: Date | null = null;
    for (const message of messages) {
      if (!lastMessageDate) {
        lastMessageDate = message.createdAt;
        messageIdGaps.push([message.messageId, 0]);
        continue;
      }

      const gapMs = message.createdAt.getTime() - lastMessageDate.getTime();
      messageIdGaps.push([message.messageId, gapMs]);
    }

    const formattedMessageCache = new Map<number, string>();

    let messageIdGapsGroups: Array<Array<[number, number]>> = [
      [...messageIdGaps],
    ];
    let breakGap = ConversationService.MAX_CONVERSATION_GAP_MS;

    let currentCharacterCount = 0;
    do {
      let nextGap = 0;

      messageIdGapsGroups[0].forEach(([, gap]) => {
        if (gap > nextGap && gap < breakGap) {
          nextGap = gap;
        }
      });

      if (nextGap > 0) {
        breakGap = nextGap;
      }

      messageIdGapsGroups = messageIdGaps.reduce(
        (groups, [id, gapMs]) => {
          if (gapMs > breakGap) {
            groups.push([]);
          }
          groups[groups.length - 1].push([id, gapMs]);
          return groups;
        },
        [...messageIdGapsGroups]
      );

      const firstMessageIdGapGroup = messageIdGapsGroups[0];

      for (let i = 0; i < firstMessageIdGapGroup.length; i++) {
        const [messageId] = firstMessageIdGapGroup[i];

        if (!formattedMessageCache.has(messageId)) {
          const message = mappedMessages.get(messageId);
          if (message) {
            const user = mappedUsers.get(message.userId);
            let responseToUser: UserDocument | undefined;

            if (message.replyToMessageId) {
              const repliedMessage = mappedMessages.get(
                message.replyToMessageId
              );

              if (repliedMessage) {
                responseToUser = mappedUsers.get(repliedMessage.userId);
              }
            }

            const formatted = this.promptService.formatMessageContent(
              message,
              user,
              responseToUser,
              false,
              true
            );
            formattedMessageCache.set(messageId, formatted);
          } else {
            formattedMessageCache.set(messageId, "");
          }
        }

        const formatted = formattedMessageCache.get(messageId) || "";
        currentCharacterCount += formatted.length;

        if (currentCharacterCount > characterCountLimit) {
          break;
        }
      }
    } while (currentCharacterCount < characterCountLimit);

    this.logger.log(
      `Conversation split into ${messageIdGapsGroups[0].length} messages ` +
        `by gaps up to ~${Math.round(
          breakGap / 1000 / 60
        )}m to fit ${currentCharacterCount} characters`
    );

    return messages.filter(
      (message) =>
        messageIdGapsGroups[0].findIndex(([id]) => id === message.messageId) >=
        0
    );
  }

  readonly summarizationSchema = {
    type: Type.OBJECT,
    properties: {
      conversations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description:
                "A concise summary of the conversation in 1-3 sentences.",
              example:
                "@alice and @bob discuss their pets. Alice tells about loving cats and that her cat named Venus.",
            },
            messageStart: {
              type: Type.STRING,
              description:
                "The id of the message with which conversation began, roughly.",
              example: "1324",
            },
            messageEnd: {
              type: Type.STRING,
              description:
                "The id of the message with which conversation ended, roughly.",
              example: "1646",
            },
            participants: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  handle: {
                    type: Type.STRING,
                    description: `Handle of the participant, comes form of ${this.promptService.wrapUserHandle(
                      {
                        userId: 123456,
                        username: "nickname",
                      }
                    )} or ${this.promptService.wrapUserHandle({
                      userId: 123456,
                    })} at the beginning of the message.`,
                    example: "@nickname",
                  },
                  attitude: {
                    type: Type.OBJECT,
                    description:
                      "Rate this person's attitude and behavior by different metrics in the conversation.",
                    properties: {
                      /**
                       * We will define that in prompt
                       */
                      hostility: {
                        type: Type.INTEGER,
                        description:
                          "How hostile or aggressive the person was, 1-10.",
                      },
                      /**
                       * One of the worst combinations is being hostile and
                       * very persuasive.
                       */
                      repetitiveness: {
                        type: Type.INTEGER,
                        description:
                          "How repetitive or insistent the person was, 1-10.",
                      },
                      engagement: {
                        type: Type.INTEGER,
                        description:
                          "How much impact messages of this participant made to " +
                          "interest other participants in a positive way, 1-10.\n" +
                          "This should not only include the quantity of messages" +
                          " but also if person decided to research topic or shown" +
                          " genuine interest.",
                      },
                      kindness: {
                        type: Type.INTEGER,
                        description:
                          "How kind the person was, cheering up others, 1-10.",
                      },
                      playfulness: {
                        type: Type.INTEGER,
                        description:
                          "How playful the user responses were, 1-10.",
                      },
                    },
                  },
                  facts: {
                    type: Type.ARRAY,
                    description:
                      "List any important facts or statements made or confirmed by this person about themselves.\n" +
                      "It's an optional field, limit amount of facts only to important ones.",
                    items: {
                      type: Type.STRING,
                      example: "Has a calico cat named Venus.",
                    },
                  },
                },
                required: ["handle", "attitude"],
              },
              required: ["name"],
            },
          },
          required: ["summary", "messageStart", "messageEnd", "participants"],
        },
      },
    },
    required: ["conversations"],
  } as const satisfies GenAiOpenApiSchema;
}
