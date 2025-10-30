import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { JobState } from "@google/genai";

export type ChatBatchJobDocument = HydratedDocument<ChatBatchJobEntity>;

@Schema({ timestamps: true })
export class ChatBatchJobEntity {
  public static COLLECTION_NAME = "chat_batch_job";

  @Prop({ require: true, index: true, unique: true })
  name?: string;

  @Prop()
  displayName?: string;

  @Prop({ required: true, default: JobState.JOB_STATE_UNSPECIFIED })
  state: JobState;

  @Prop()
  startedAt: Date;

  @Prop()
  completedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChatBatchJobSchema =
  SchemaFactory.createForClass(ChatBatchJobEntity);
