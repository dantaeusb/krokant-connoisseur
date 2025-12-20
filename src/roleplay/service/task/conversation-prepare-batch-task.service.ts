import { Injectable, Logger } from "@nestjs/common";
import { ScheduledTaskDocument } from "@core/entity/scheduled-task.entity";
import { TaskService } from "@core/service/task.service";
import {
  ChatBatchDocument,
  ChatBatchEntity,
} from "@genai/entity/chat-batch.entity";
import { Content, Schema as GenAiOpenApiSchema, Type } from "@google/genai";
import { MessageDocument } from "@core/entity/message.entity";
import { UserDocument } from "@core/entity/user.entity";
import { ConfigService } from "@core/service/config.service";
import { CounterService } from "@core/service/counter.service";
import { GeminiService } from "@genai/service/gemini.service";
import { BatchService } from "@genai/service/batch.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { PromptService } from "@roleplay/service/prompt.service";
import { ConversationProcessBatchTaskService } from "@roleplay/service/task/conversation-process-batch-task.service";
import { AbstractTaskService } from "@core/service/abstract-task.service";

/**
 * If there are enough new messages the task will prepare a batch to summarize
 * and extract peoples' characteristics from them.
 */
@Injectable()
export class ConversationPrepareBatchTaskService extends AbstractTaskService {
  public static readonly CODE = "conversation-prepare-batch";
  private static MIN_TOKENS_FOR_BATCH = 25000;

  private readonly logger = new Logger(
    "Roleplay/ConversationPrepareBatchTaskService"
  );

  constructor(
    taskService: TaskService,
    private readonly configService: ConfigService,
    private readonly counterService: CounterService,
    private readonly geminiService: GeminiService,
    private readonly batchService: BatchService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly promptService: PromptService
  ) {
    super(ConversationPrepareBatchTaskService.CODE, taskService);
  }

  public async run(chatId: number) {
    const messages = await this.getOldestUnprocessedMessages(chatId);

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

    await this.batchService.assignBatchJobToBatch(
      chatId,
      batch.id,
      batchJob.name,
      batchJob.displayName,
      batchJob.state
    );

    this.taskService.scheduleTask(
      chatId,
      ConversationProcessBatchTaskService.CODE,
      [batch.id]
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
