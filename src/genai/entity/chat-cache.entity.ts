import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ChatCacheDocument = HydratedDocument<ChatCacheEntity>;

@Schema({ timestamps: true })
export class ChatCacheEntity {
  public static COLLECTION_NAME = "chat_cache";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true })
  startMessageId: number;

  @Prop({ required: true })
  endMessageId: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChatCacheSchema = SchemaFactory.createForClass(ChatCacheEntity);
