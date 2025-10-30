import { Injectable, Logger } from "@nestjs/common";
import { Bucket, Storage } from "@google-cloud/storage";
import { ConfigService } from "@core/service/config.service";
import {
  ChatBatchDocument,
  ChatBatchEntity,
} from "../entity/chat-batch.entity";
import {
  Content,
  ContentListUnion,
  GenerateContentConfig,
  GenerateContentResponse,
  JobState,
} from "@google/genai";
import { BotName } from "@/app.constants";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { GENAI_JOB_STATES_PROGRESS } from "@genai/const/job-states.const";

type BatchRequest = {
  contents: ContentListUnion;
  systemInstruction: Content;
  safetySettings: GenerateContentConfig["safetySettings"];
  generationConfig: Exclude<
    GenerateContentConfig,
    "systemInstruction" | "safetySettings"
  >;
};

type BatchResponse = {
  request: BatchRequest;
  response: GenerateContentResponse;
};

@Injectable()
export class BatchService {
  private logger: Logger = new Logger("Genai/BatchService");

  private storage: Storage;

  constructor(
    @InjectModel(ChatBatchEntity.COLLECTION_NAME)
    private chatBatchEntityModel: Model<ChatBatchEntity>,
    private readonly configService: ConfigService
  ) {
    this.storage = new Storage({
      keyFilename: "./gcp-key.json",
    });
  }

  public async getChatBucket(chatId: number): Promise<Bucket> {
    const bucketName = this.getChatBucketBatchInputName(chatId);
    const chatBucket = this.storage.bucket(bucketName);
    const [exists] = await chatBucket.exists();

    if (exists) {
      return chatBucket;
    }

    const newBucket = await this.storage.createBucket(bucketName, {
      // @todo: [LOW]: Make location configurable
      location: "EUROPE-WEST4",
      nearline: true,
      predefinedAcl: "projectPrivate",
    });

    return newBucket[0];
  }

  /**
   * Stores batch requests in the chat bucket and creates a ChatBatchEntity
   *
   * @param chatId
   * @param batchId
   * @param requests
   * @param startMessageId
   * @param endMessageId
   */
  public async putBatchRequestsInBucket(
    chatId: number,
    batchId: number,
    requests: ReadonlyArray<BatchRequest>,
    [startMessageId, endMessageId]: [number, number]
  ): Promise<ChatBatchDocument | null> {
    const bucket = await this.getChatBucket(chatId);
    const fileName = this.getChatBatchInputFileName(batchId);
    const file = bucket.file(fileName);

    const lines = requests.map((request) => {
      return JSON.stringify({
        request: request,
      });
    });

    await file.save(lines.join("\n"), {
      contentType: "application/jsonl",
    });

    return await this.chatBatchEntityModel.create({
      id: batchId,
      chatId: chatId,
      inputFileName: fileName,
      outputFolder: this.getChatBatchOutputFolderName(batchId),
      startMessageId,
      endMessageId,
    });
  }

  public async getBatchResponseFromBucket(
    chatId: number,
    batchId: number
  ): Promise<Array<BatchResponse>> {
    const bucket = await this.getChatBucket(chatId);
    const outputFolder = this.getChatBatchOutputFolderName(batchId);
    const [files] = await bucket.getFiles({ prefix: outputFolder + "/" });
    const predictionsFile = files.find((file) =>
      file.name.endsWith("predictions.jsonl")
    );

    const responses: Array<BatchResponse> = [];

    const [contents] = await predictionsFile.download();
    const lines = contents.toString().split("\n");

    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      responses.push(JSON.parse(line));
    }

    return responses;
  }

  public async assignBatchJobToBatch(
    chatId: number,
    batchId: number,
    jobName: string,
    jobDisplayName: string,
    jobState: JobState
  ): Promise<ChatBatchDocument | null> {
    return this.chatBatchEntityModel
      .findOneAndUpdate(
        { chatId: chatId, id: batchId },
        {
          $set: {
            job: {
              name: jobName,
              displayName: jobDisplayName,
              state: jobState,
            },
          },
        },
        { new: true }
      )
      .exec();
  }

  public async cleanupBatchBucket(
    chatId: number,
    batchId: number
  ): Promise<void> {
    const bucket = await this.getChatBucket(chatId);
    const batch = await this.chatBatchEntityModel.findOne({
      chatId: chatId,
      id: batchId,
    });

    if (!batch) {
      return;
    }

    const inputFile = bucket.file(batch.inputFileName);
    await inputFile.delete().catch((error) => {
      this.logger.warn(`Failed to delete input file: ${error.message}`);
    });

    const [files] = await bucket.getFiles({
      prefix: batch.outputFolder + "/",
    });

    for (const file of files) {
      await file.delete().catch((error) => {
        this.logger.warn(`Failed to delete output file: ${error.message}`);
      });
    }
  }

  public async getPendingBatches(
    chatId: number
  ): Promise<Array<ChatBatchDocument>> {
    return this.chatBatchEntityModel
      .find({
        chatId: chatId,
        $or: GENAI_JOB_STATES_PROGRESS.map((state) => ({
          "job.state": state,
        })),
      })
      .exec();
  }

  public async updateBatchJobState(
    chatId: number,
    batchId: number,
    newState: JobState,
    startedAt?: Date,
    completedAt?: Date
  ): Promise<ChatBatchDocument | null> {
    return this.chatBatchEntityModel
      .findOneAndUpdate(
        { chatId: chatId, id: batchId },
        {
          $set: {
            "job.state": newState,
            ...(startedAt ? { "job.startedAt": startedAt } : {}),
            ...(completedAt ? { "job.completedAt": completedAt } : {}),
          },
        },
        { new: true }
      )
      .exec();
  }

  public getChatBucketUrl(chatId: number, fileName: string): string {
    const bucketName = this.getChatBucketBatchInputName(chatId);
    return `gs://${bucketName}/${fileName}`;
  }

  public getChatBucketBatchInputName(chatId: number): string {
    return `${BotName.toLowerCase()}-chat-bucket-${chatId}`;
  }

  public getChatBatchInputFileName(batchId: number): string {
    return `batch-${batchId}-input.json`;
  }

  public getChatBatchOutputFolderName(batchId: number): string {
    return `batch-${batchId}-output`;
  }
}
