import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type HydratedMessageDocument = HydratedDocument<MessageEntity>

@Schema({ timestamps: true })
export class MessageEntity {
  public static COLLECTION_NAME = "message";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true })
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

  // No need for prop its managed by timestamps: true
  createdAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageEntity);
MessageSchema.index({ messageId: 1 });
// All messages in a chat
MessageSchema.index({ chatId: 1 });
// All messages from a user in a chat
MessageSchema.index({ userId: 1 });
// Expire messages after 30 days
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });