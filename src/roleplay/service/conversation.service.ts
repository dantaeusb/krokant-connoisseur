import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { GeminiService } from "@genai/service/gemini.service";
import { ConfigService } from "@core/service/config.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { PersonService } from "@roleplay/service/person.service";
import { MessageDocument } from "@core/entity/message.entity";
import {
  Candidate,
  Content,
  Schema as GenAiOpenApiSchema,
  Type,
} from "@google/genai";
import { PromptService } from "@roleplay/service/prompt.service";
import { UserDocument } from "@core/entity/user.entity";
import {
  ConversationDocument,
  ConversationEntity,
} from "@roleplay/entity/conversation.entity";

import { CounterService } from "@core/service/counter.service";
import { Cron } from "@nestjs/schedule";
import { PersonThoughtEntity } from "@roleplay/entity/person/thought.entity";

type SummarizationResponse = {
  conversations: Array<{
    title: string;
    summary: string;
    weight: number;
    messageStart: string;
    messageEnd: string;
    participants: Array<{
      handle: string;
      weight: number;
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

/**
 * @todo: [HIGH] Use Batch API to reduce costs – there's no need to do this job real time
 */
@Injectable()
export class ConversationService {
  private static MAX_CONVERSATION_GAP_MS = 1000 * 60 * 60 * 4; // 4 hours
  private static MAX_RUNS_PER_HOUR = 10;

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

  public async getConversation(
    chatId: number,
    conversationId: number
  ): Promise<ConversationEntity | null> {
    return await this.conversationEntityModel
      .findOne({ chatId, conversationId })
      .lean()
      .exec();
  }

  public async getConversations(
    chatId: number,
    limit = 100
  ): Promise<Array<ConversationDocument>> {
    return await this.conversationEntityModel
      .find({ chatId })
      .sort({ time: -1 })
      .limit(limit)
      .exec();
  }

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
              `In that cluster, you need to identify separate conversations.\n` +
              `Typically it's expected to have 1-5 conversations in the window.\n` +
              `Some conversations are small, some are large and span many messages.\n` +
              `Messages are starting with #Message ID: [User Handle] (Time)\n` +
              `User handle has the format of @nickname or ID:UserID. Keep ` +
              `[User Handle] formatting in the response.\n` +
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

    const candidate: Candidate = await this.geminiService.summarizeAndRate(
      [...promptList, ...messagesPrompt],
      this.summarizationSchema,
      `${config.summarizerSystemPrompt}`
    );

    const response: SummarizationResponse = JSON.parse(
      candidate.content.parts.map((part) => part.text || "").join("\n") ?? null
    );

    for (const conversation of response.conversations) {
      const messageStartId = parseInt(
        conversation.messageStart.replace(/^#/g, ""),
        10
      );
      const messageEndId = parseInt(
        conversation.messageEnd.replace(/^#/g, ""),
        10
      );

      if (
        isNaN(messageStartId) ||
        isNaN(messageEndId) ||
        messageEndId < messageStartId
      ) {
        throw new Error(
          `Invalid message IDs in conversation summary: ` +
            `start=${conversation.messageStart}, end=${conversation.messageEnd}`
        );
      }

      this.logger.log(
        `Conversation from #${messageStartId} to #${messageEndId}: ` +
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
          message.messageId >= messageStartId &&
          message.messageId <= messageEndId
        );
      });

      const timeStart = messagesInConversation[0]
        ? messagesInConversation[0].date
        : new Date();
      const timeEnd = messagesInConversation[messagesInConversation.length - 1]
        ? messagesInConversation[messagesInConversation.length - 1].date
        : new Date();
      // Round to hour
      const halfConversationPeriodMs = Math.round(
        (timeEnd.getTime() - timeStart.getTime()) / 2
      );
      const midConversationTime = new Date(
        timeStart.getTime() + halfConversationPeriodMs
      );

      const rounding = 15 * 60 * 1000; // 15 minutes

      const time = new Date(
        Math.round(midConversationTime.getTime() / rounding) * rounding
      );

      const conversationId = await this.counterService.getNextSequence(
        `${ConversationEntity.COLLECTION_NAME}-${chatId}`
      );

      const newConversation = await this.conversationEntityModel.create({
        chatId,
        conversationId,
        title: conversation.title,
        summary: conversation.summary,
        weight: this.clampScore(conversation.weight),
        messageStartId: messageStartId,
        messageEndId: messageEndId,
        participantIds: participantUserIds,
        date: time,
      });

      await this.messageService.addConversationIdToMessages(
        chatId,
        messagesInConversation.map((message) => message.messageId),
        newConversation.conversationId
      );

      await this.updateFactsAndThoughts(
        chatId,
        participantUsers,
        conversation,
        time
      );
    }
  }

  private async updateFactsAndThoughts(
    chatId: number,
    participantUsers: Array<UserDocument>,
    conversation: SummarizationResponse["conversations"][0],
    date: Date
  ): Promise<void> {
    const thoughtTitle = `Conversation about ${conversation.title}`;

    for (let i = 0; i < participantUsers.length; i++) {
      const user = participantUsers[i];
      const participant = conversation.participants[i];

      if (!participant) {
        continue;
      }

      const person = await this.personService.getPerson(
        chatId,
        user.userId,
        true
      );

      if (!person) {
        continue;
      }

      let updated = false;

      if (participant.facts && participant.facts.length > 0) {
        for (const fact of participant.facts) {
          person.characteristics.push(fact);
          updated = true;
        }
      }

      const newThought: PersonThoughtEntity = {
        thought: thoughtTitle,
        opinionModifier: 0,
        weight: this.clampScore(
          (conversation.weight / 10) * participant.weight
        ),
        factors: [
          {
            factor: "hostility",
            value: this.clampScore(participant.attitude.hostility),
          },
          {
            factor: "repetitiveness",
            value: this.clampScore(participant.attitude.repetitiveness),
          },
          {
            factor: "engagement",
            value: this.clampScore(participant.attitude.engagement),
          },
          {
            factor: "kindness",
            value: this.clampScore(participant.attitude.kindness),
          },
          {
            factor: "playfulness",
            value: this.clampScore(participant.attitude.playfulness),
          },
        ],
        date: date,
      };

      person.thoughts.push(newThought);
      updated = true;

      if (updated) {
        await person.save();
      }
    }
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

    if (messages.length === 0) {
      return [];
    }

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
      `Selected conversation chunk of ${messageIdGapsGroups[0].length} messages ` +
        `by gap of ~${Math.round(
          breakGap / 1000 / 60
        )}m to fit ${currentCharacterCount} characters`
    );

    return messages.filter(
      (message) =>
        messageIdGapsGroups[0].findIndex(([id]) => id === message.messageId) >=
        0
    );
  }

  @Cron("0 */6 * * *")
  public async processUnprocessedConversations(chatId?: number): Promise<void> {
    let chatIds = [];

    if (chatId) {
      chatIds = [chatId];
    } else {
      chatIds = await this.configService.getAllChatIds();
    }

    for (const chatId of chatIds) {
      let processedCount = 0;
      do {
        try {
          await this.processOldestUnprocessedConversation(chatId);

          processedCount++;
          this.logger.log(`Processed conversation for chat ${chatId}`);
        } catch (err) {
          this.logger.error(
            `Error processing conversations for chat ${chatId}: ${err.message}`,
            err.stack
          );
          processedCount++;
          // Not having this put me in debt to Alphabet LLC for life
          // Thread carefully
          break;
        }
      } while (processedCount < ConversationService.MAX_RUNS_PER_HOUR);

      if (processedCount > 0) {
        this.logger.log(
          `Processed ${processedCount} conversations for chat ${chatId}`
        );
      }
    }
  }

  private clampScore = (score: number): number => {
    if (score < 1) {
      return 1;
    } else if (score > 10) {
      return 10;
    }

    return Math.round(score);
  };

  readonly summarizationSchema = {
    type: Type.OBJECT,
    properties: {
      conversations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description:
                'Short phrase to title conversion as to fit in "Conversation about X" template. ' +
                'Do not include "Conversation about"',
              example: "Pets",
            },
            summary: {
              type: Type.STRING,
              description:
                "A concise summary of the conversation in 2-5 sentences.",
              example:
                "@alice and @bob discuss their pets. Alice tells about loving cats and that her cat named Venus.",
            },
            weight: {
              type: Type.INTEGER,
              description:
                "How impactful this conversation was on other users, how important it is to remember, 1-10.",
              example: 7,
            },
            messageStart: {
              type: Type.STRING,
              description:
                "The id of the message with which conversation began, roughly.\n" +
                "Conversations can overlap by few messages, but no messages should be " +
                "left out before and between conversations.",
              example: "1324",
            },
            messageEnd: {
              type: Type.STRING,
              description:
                "The id of the message with which conversation ended, roughly.\n" +
                "Conversations can overlap by few messages, but no messages should be " +
                "left out before and between conversations.",
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
                  weight: {
                    type: Type.INTEGER,
                    description:
                      "How impactful this person's messages were on other users, 1-10.",
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
                      "It's an optional field, limit amount of facts only to important ones.\n" +
                      "If person claims model said something wrong, it's an important fact.\n" +
                      "Never include any personally identifiable information information, such as " +
                      "precise home or work address, place of work or study, phone numbers, " +
                      "government ID's, emails. Can collect part of the names in one fact, but not full names.\n",
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
          required: [
            "title",
            "summary",
            "weight",
            "messageStart",
            "messageEnd",
            "participants",
          ],
        },
      },
    },
    required: ["conversations"],
  } as const satisfies GenAiOpenApiSchema;
}
