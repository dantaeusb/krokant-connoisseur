import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  ChatBatchJobEntity,
  ChatBatchJobSchema,
} from "./batch/chat-batch-job.entity";

export type ChatBatchDocument = HydratedDocument<ChatBatchEntity>;

@Schema({ timestamps: true })
export class ChatBatchEntity {
  public static COLLECTION_NAME = "chat_batch";

  @Prop({ required: true })
  id: number;

  @Prop({ required: true })
  chatId: number;

  @Prop({ required: true })
  inputFileName: string;

  @Prop({ required: true })
  outputFolder: string;

  @Prop({ type: ChatBatchJobSchema })
  job?: ChatBatchJobEntity;

  @Prop({ required: true })
  startMessageId: number;

  @Prop({ required: true })
  endMessageId: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChatBatchSchema = SchemaFactory.createForClass(ChatBatchEntity);
ChatBatchSchema.index({ id: 1, chatId: 1 }, { unique: true });
