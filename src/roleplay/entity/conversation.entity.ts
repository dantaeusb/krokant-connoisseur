import { HydratedDocument } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type ConversationDocument = HydratedDocument<ConversationEntity>;

@Schema({ timestamps: true })
export class ConversationEntity {
  public static COLLECTION_NAME = "conversation";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  conversationId: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ required: true })
  weight: number;

  @Prop({ required: true })
  messageStartId: number;

  @Prop({ required: true })
  messageEndId: number;

  @Prop({ required: true })
  participantIds: Array<number>;

  @Prop({ required: true })
  date: Date;

  // No need for prop its managed by timestamps: true
  updatedAt?: Date;
  createdAt?: Date;
}

export const ConversationEntitySchema =
  SchemaFactory.createForClass(ConversationEntity);
ConversationEntitySchema.index(
  { chatId: 1, conversationId: 1 },
  { unique: true }
);
