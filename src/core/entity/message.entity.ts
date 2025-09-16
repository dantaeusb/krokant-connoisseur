import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
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
}

export const MessageSchema = SchemaFactory.createForClass(MessageEntity);
MessageSchema.index({ messageId: 1 });
// All messages in a chat
MessageSchema.index({ chatId: 1 });
// All messages from a user in a chat
MessageSchema.index({ userId: 1 });
