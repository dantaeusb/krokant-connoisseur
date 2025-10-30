import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PingGroupDocument, PingGroupSchema } from "./config/ping-group.entity";
import { HydratedDocument, Types } from "mongoose";
import {
  ProfanityFilterDocument,
  ProfanityFilterSchema,
} from "@moderation/entity/profanity-filter.entity";
import {
  AnswerStrategyDocument,
  AnswerStrategySchema,
} from "@roleplay/entity/answer-strategy.entity";

export type ChatConfigDocument = HydratedDocument<ChatConfigEntity>;

/**
 * Chat config, effectively mongo just adds persistence to in-memory config.
 * Use `/reload` command to reload from DB if changes are made directly.
 */
@Schema({ timestamps: true })
export class ChatConfigEntity {
  public static COLLECTION_NAME = "config";

  @Prop({ required: true, index: true })
  chatId: number;

  /**
   * Whether the bot should be more likely to respond to messages in the chat
   * and rephrase messages from commands.
   */
  @Prop({ required: true, default: false })
  yapping: boolean;

  /**
   * This will be used as a system prompt for the chat interactions,
   * i.e. replies and rephrasings, or any other user interactions if
   * enabled.
   *
   * It's a system prompt, so it should contain instructions
   * on how to read and how to answer.
   */
  @Prop({
    default:
      "You're a chat bot that is designed to moderate, provide information" +
      "and spark conversations in a group chat.\n" +
      "You will be provided with your roleplay prompt, chat information, participants information and " +
      "conversation context. Following that, you may be given the latest messages in chat and " +
      "a message to react to according to the chosen strategy.\n" +
      "Try to address users by their nicknames or names if possible, avoid using " +
      "handles or ID's unless the question better redirected to the person.\n" +
      "Keep conversational messages short, but give answers proper nuance. Avoid excessive formatting.",
  })
  characterSystemPrompt: string;

  @Prop({
    default:
      "You are an expert at determining the best way to respond to messages in a group chat setting. " +
      "Based on the given bot roleplay persona, context of the conversation and the content of the message, " +
      "choose which would be the best strategy for the bot to respond from given options. " +
      "When evaluating if extra context is needed, consider if the bot has enough information to provide " +
      "a relevant and accurate response. If user requests a summary of events or a question is relevant to the chat " +
      "request extra context for the next step",
  })
  answerStrategySystemPrompt: string;

  /**
   * This will be used as a prompt for the character actions,
   * i.e. replies and rephrasings, or any other user interactions if
   * enabled.
   */
  @Prop({ default: "" })
  characterPrompt: string;

  @Prop({ default: "" })
  chatInformationPrompt: string;

  /**
   * This will be used as a system prompt for the chat quality index
   * analysis, that supposed to sentiment-analyze the chat with
   * different metrics.
   */
  @Prop({ default: "" })
  chatQualityIndexPrompt: string;

  /**
   * This will be used as a system prompt for the summaries generation
   * when messages are over context or lifetime limit.
   */
  @Prop({
    default:
      "As an independent part of the chatbot system, summarize and rate the given messages neutrally in a manner that is the most useful for the chatbot roleplay model",
  })
  summarizerSystemPrompt: string;

  @Prop({ default: false })
  canGoogle: boolean;

  @Prop([PingGroupSchema])
  pingGroups: Types.DocumentArray<PingGroupDocument>;

  @Prop([ProfanityFilterSchema])
  profanityFilters: Types.DocumentArray<ProfanityFilterDocument>;

  @Prop([AnswerStrategySchema])
  answerStrategies: Types.DocumentArray<AnswerStrategyDocument>;

  @Prop({ default: false })
  debugMode: boolean;
}

export const ConfigSchema = SchemaFactory.createForClass(ChatConfigEntity);
