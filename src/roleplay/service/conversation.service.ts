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
}
