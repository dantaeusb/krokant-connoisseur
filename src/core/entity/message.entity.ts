import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type HydratedMessageDocument = HydratedDocument<MessageEntity>

@Schema({ timestamps: true })
export class MessageEntity {
  public static COLLECTION_NAME = "message";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  messageId: number;

  @Prop()
  replyToMessageId?: number;

  @Prop({ required: true, index: true })
  userId: number;

  @Prop({ required: true })
  text: string;

  @Prop({ default: Date.now })
  date: Date;

  @Prop()
  forwardedFromUserId?: number;

  /**
   * UUID of the conversation this message is part of,
   */
  /*@Prop()
  conversationUuid?: string;*/

  // No need for prop its managed by timestamps: true
  updatedAt?: Date;
  createdAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageEntity);
// Expire messages after 30 days
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });