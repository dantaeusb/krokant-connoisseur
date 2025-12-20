import { Injectable, Logger } from "@nestjs/common";
import { ScheduledTaskDocument } from "@core/entity/scheduled-task.entity";
import { ChatBatchDocument } from "@genai/entity/chat-batch.entity";
import { Content, JobState } from "@google/genai";
import { UserDocument } from "@core/entity/user.entity";
import { ConfigService } from "@core/service/config.service";
import { CounterService } from "@core/service/counter.service";
import { GeminiService } from "@genai/service/gemini.service";
import { BatchService } from "@genai/service/batch.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { PromptService } from "@roleplay/service/prompt.service";
import {
  GENAI_JOB_STATES_FAILED,
  GENAI_JOB_STATES_PROGRESS,
  GENAI_JOB_STATES_SUCCESS,
} from "@/genai/const/job-states.const";
import { ConversationEntity } from "@roleplay/entity/conversation.entity";
import { PersonService } from "@roleplay/service/person.service";

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
 * Plan task once batch is prepared.
 * Process chat messages in batches to identify and separate distinct conversations.
 */
@Injectable()
export class ConversationProcessBatchTaskService {
  public static readonly CODE = "conversation-process-batch";

  private readonly logger = new Logger(
    "Roleplay/ConversationProcessBatchTaskService"
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly counterService: CounterService,
    private readonly geminiService: GeminiService,
    private readonly batchService: BatchService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly personService: PersonService,
    private readonly promptService: PromptService
  ) {}

  public async run(chatId: number, batchId: number) {
    const batch = await this.batchService.getBatch(chatId, batchId);

    if (!batch) {
      throw new Error(`Batch ${batchId} for chat ${chatId} not found`);
    }

    if (!batch.job || !batch.job.name) {
      throw new Error(
        `Batch ${batch.id} for chat ${chatId} has no job assigned`
      );
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
}
