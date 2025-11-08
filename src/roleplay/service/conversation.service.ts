import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { GeminiService } from "@genai/service/gemini.service";
import { ConfigService } from "@core/service/config.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { PersonService } from "@roleplay/service/person.service";
import { MessageDocument } from "@core/entity/message.entity";
import { Content, JobState, Schema as GenAiOpenApiSchema, Type } from "@google/genai";
import { PromptService } from "@roleplay/service/prompt.service";
import { UserDocument } from "@core/entity/user.entity";
import {
  ConversationDocument,
  ConversationEntity,
} from "@roleplay/entity/conversation.entity";
import { CounterService } from "@core/service/counter.service";
import { Cron } from "@nestjs/schedule";
import { PersonThoughtEntity } from "@roleplay/entity/person/thought.entity";
import { BatchService } from "@genai/service/batch.service";
import {
  ChatBatchDocument,
  ChatBatchEntity,
} from "@genai/entity/chat-batch.entity";
import {
  GENAI_JOB_STATES_FAILED,
  GENAI_JOB_STATES_PROGRESS,
  GENAI_JOB_STATES_SUCCESS,
} from "@genai/const/job-states.const";

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
 * Service to process conversations from message history
 * and extract structured conversation data.
 *
 * It uses Vertex AI batch processing to analyze message clusters
 * asynchronously, using GCP buckets to store conversations and
 * Batch Jobs to process them.
 *
 * Extracted conversations are stored in the database
 * and linked to messages.
 */
@Injectable()
export class ConversationService {
  private static MIN_TOKENS_FOR_BATCH = 25000;

  private logger: Logger = new Logger("Roleplay/ConversationService");

  constructor(
    @InjectModel(ConversationEntity.COLLECTION_NAME)
    private readonly conversationEntityModel: Model<ConversationEntity>,
    private readonly configService: ConfigService,
    private readonly counterService: CounterService,
    private readonly geminiService: GeminiService,
    private readonly batchService: BatchService,
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

  @Cron("0 */6 * * *")
  public async batchMessages(chatId?: number): Promise<void> {
    let chatIds: Array<number>;

    if (chatId) {
      chatIds = [chatId];
    } else {
      chatIds = await this.configService.getAllChatIds();
    }

    for (const chatId of chatIds) {
      try {
        const config = await this.configService.getConfig(chatId);

        if (!config.yapping) {
          this.logger.log(
            `Yapping is disabled for chat ${chatId}, skipping batching.`
          );
          continue;
        }

        await this.batchChatMessages(chatId);

        this.logger.log(`Batched messages for chat ${chatId}`);
      } catch (err) {
        this.logger.error(
          `Error  batching messages for chat ${chatId}: ${err.message}`,
          err.stack
        );
        break;
      }
    }
  }

  public async batchChatMessages(
    chatId: number,
    tokenLimit = 500000
  ): Promise<ChatBatchDocument | null> {
    const messages = await this.getOldestUnprocessedMessages(
      chatId,
      tokenLimit
    );

    if (messages.length === 0) {
      this.logger.log(`Not unprocessed messages found for chat ${chatId}`);
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

    const batchId = await this.counterService.getNextSequence(
      `${ChatBatchEntity.COLLECTION_NAME}-${chatId}`
    );

    const batch = await this.batchService.putBatchRequestsInBucket(
      chatId,
      batchId,
      [
        {
          contents: [...promptList, ...messagesPrompt],
          systemInstruction: {
            role: "user",
            parts: [
              {
                text: config.summarizerSystemPrompt,
              },
            ],
          },
          safetySettings: this.geminiService.getSafetySettings(),
          generationConfig: {
            candidateCount: 1,
            temperature: 0.5,
            topP: 1.0,
            responseMimeType: "application/json",
            responseSchema: this.summarizationSchema,
          },
        },
      ],
      [messages[0].messageId, messages[messages.length - 1].messageId]
    );

    if (!batch) {
      throw new Error("Failed to create batch for chat messages summarization");
    }

    const batchJob = await this.geminiService.batchGood(
      this.batchService.getChatBucketUrl(chatId, batch.inputFileName),
      this.batchService.getChatBucketUrl(chatId, batch.outputFolder),
      this.batchService.getChatBucketBatchInputName(chatId)
    );

    return await this.batchService.assignBatchJobToBatch(
      chatId,
      batch.id,
      batchJob.name,
      batchJob.displayName,
      batchJob.state
    );
  }

  /**
   * Tries to find the largest gaps in the message history and split by them
   * aiming to keep no more than character target count.
   *
   * Excludes messages already processed or in pending batches (by latest
   * pending batch)
   *
   * First gets some number of latest messages, then finds gaps larger than
   * MAX_CONVERSATION_GAP_MS and splits by them. If the resulting chunks are still
   * too large, it will further split them by larger gaps until the character
   * count limit is met.
   * @param chatId
   * @param tokenLimit
   */
  private async getOldestUnprocessedMessages(
    chatId: number,
    tokenLimit = 500000
  ): Promise<Array<MessageDocument>> {
    const pendingBatches = await this.batchService.getPendingBatches(chatId);

    const latestPendingBatch = pendingBatches.reduce(
      (latest, batch) =>
        !latest || batch.endMessageId > latest.endMessageId ? batch : latest,
      null as ChatBatchDocument | null
    );

    let messages = await this.messageService.getOldestUnprocessedMessages(
      chatId,
      undefined,
      latestPendingBatch ? latestPendingBatch.endMessageId : undefined
    );

    let largestEndGapMs = 0;
    let largestEndGapIndex = -1;
    for (let i = messages.length; i < Math.max(0, messages.length - 100); i--) {
      const gapMs =
        messages[i].createdAt.getTime() - messages[i - 1].createdAt.getTime();
      if (gapMs > largestEndGapMs) {
        largestEndGapMs = gapMs;
        largestEndGapIndex = i;
      }
    }

    messages = messages.slice(0, largestEndGapIndex);

    if (messages.length <= 100) {
      return [];
    }

    const mappedMessages: Map<number, MessageDocument> = new Map();
    messages.forEach((message) =>
      mappedMessages.set(message.messageId, message)
    );

    const users = await this.userService.getParticipants(chatId, messages);
    const mappedUsers: Map<number, UserDocument> = new Map();
    users.forEach((user) => mappedUsers.set(user.userId, user));

    // Log IDs and gap duration in milliseconds between messages.
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

    let currentTokenCount = 0;
    let largestGap = Infinity;

    do {
      let nextLargestGapMs = 0;
      const nextMessageIdGapsGroups: Array<Array<[number, number]>> = [[]];
      messageIdGapsGroups.forEach((group) => {
        for (let i = 0; i < group.length; i++) {
          const [, gapMs] = group[i];
          if (gapMs > nextLargestGapMs) {
            nextLargestGapMs = gapMs;
          }

          if (gapMs >= largestGap) {
            // Split here
            nextMessageIdGapsGroups.push(group.slice(0, i));
            nextMessageIdGapsGroups.push(group.slice(i));
            break;
          }

          nextMessageIdGapsGroups[nextMessageIdGapsGroups.length - 1].push(
            group[i]
          );
        }
      });

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
      }

      currentTokenCount = await this.geminiService.getTokenCount(
        "advanced",
        Array.from(formattedMessageCache.values()).join("\n")
      );

      messageIdGapsGroups = nextMessageIdGapsGroups;
      largestGap = nextLargestGapMs;
    } while (currentTokenCount > tokenLimit);

    this.logger.log(
      `Selected conversation chunk of ${messageIdGapsGroups[0].length} messages ` +
        `(${currentTokenCount} tokens) ` +
        `by gap of ~${Math.round(largestGap / 1000 / 60)}m ` +
        `to fit ${tokenLimit} tokens`
    );

    return messages.filter(
      (message) =>
        messageIdGapsGroups[0].findIndex(([id]) => id === message.messageId) >=
        0
    );
  }

  @Cron("*/15 * * * *")
  public async retrieveBatchResults(chatId?: number): Promise<void> {
    let chatIds = [];

    if (chatId) {
      chatIds = [chatId];
    } else {
      chatIds = await this.configService.getAllChatIds();
    }

    for (const chatId of chatIds) {
      const batches = await this.batchService.getPendingBatches(chatId);

      for (const batch of batches) {
        if (!batch.job || !batch.job.name) {
          this.logger.warn(
            `Batch ${batch.id} for chat ${chatId} has no job assigned`
          );
          continue;
        }

        // @todo: [MED] Switch is wrong, get only returns pending jobs
        const batchJob = await this.geminiService.getBatchJob(batch.job.name);

        try {
          if (GENAI_JOB_STATES_PROGRESS.includes(batchJob.state)) {
            this.logger.log(
              `Batch ${batch.id} for chat ${chatId} is still in progress (${batchJob.state})`
            );
            continue;
          } else if (GENAI_JOB_STATES_SUCCESS.includes(batchJob.state)) {
            this.logger.log(
              `Processing completed batch ${batch.id} for chat ${chatId}`
            );

            const results = await this.batchService.getBatchResponseFromBucket(
              chatId,
              batch.id
            );

            if (!results || results.length === 0) {
              this.logger.warn(
                `No results found in batch ${batch.id} for chat ${chatId}`
              );
              continue;
            }

            let errorsOccurred = false;

            for (const result of results) {
              if (
                !result.response ||
                !result.response.candidates ||
                result.response.candidates.length === 0
              ) {
                this.logger.warn(
                  `Invalid result in batch ${batch.id} for chat ${chatId}`
                );
                errorsOccurred = true;
                continue;
              }

              await this.processBatchResults(
                chatId,
                batch,
                result.response.candidates[0].content
              );
            }

            if (!errorsOccurred) {
              await this.batchService.cleanupBatchBucket(chatId, batch.id);
            }
          } else if (GENAI_JOB_STATES_FAILED.includes(batchJob.state)) {
            this.logger.error(
              `Batch ${batch.id} for chat ${chatId} failed with state ${batchJob.state}`
            );
          } else {
            this.logger.warn(
              `Batch ${batch.id} for chat ${chatId} has unknown state ${batchJob.state}`
            );
          }
        } catch (err) {
          this.logger.error(
            `Error processing batch ${batch.id} for chat ${chatId}: ${err.message}`,
            err.stack
          );

          await this.batchService.updateBatchJobState(
            chatId,
            batch.id,
            JobState.JOB_STATE_FAILED,
            batchJob.startTime ? new Date(batchJob.startTime) : undefined,
            batchJob.endTime ? new Date(batchJob.endTime) : undefined
          );
        }

        await this.batchService.updateBatchJobState(
          chatId,
          batch.id,
          batchJob.state,
          batchJob.startTime ? new Date(batchJob.startTime) : undefined,
          batchJob.endTime ? new Date(batchJob.endTime) : undefined
        );

        this.logger.log(
          `Processed batch ${batch.id} for chat ${chatId} to state ${batchJob.state}`
        );
      }
    }
  }

  public async processBatchResults(
    chatId: number,
    batch: ChatBatchDocument,
    content: Content
  ): Promise<void> {
    const messages = await this.messageService.getMessages(
      chatId,
      batch.startMessageId,
      batch.endMessageId
    );

    const participantIds = new Set<number>();
    messages.forEach((message) => participantIds.add(message.userId));

    const users = await this.userService.getUsers(
      chatId,
      Array.from(participantIds)
    );

    const response: SummarizationResponse = JSON.parse(
      content.parts.map((part) => part.text || "").join("\n") ?? null
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
