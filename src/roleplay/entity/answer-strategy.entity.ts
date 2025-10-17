import { HydratedDocument } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PersonEntitySchema } from "@roleplay/entity/person.entity";
import { ModelQualityType } from "@genai/types/model-quality.type";

export type AnswerStrategyDocument = HydratedDocument<AnswerStrategyEntity>;

export const HARDCODED_STRATEGY_CODE_CONVERSATION = "conversation";
export const HARDCODED_STRATEGY_CONVERSATION: Omit<
  AnswerStrategyEntity,
  "chatId"
> = {
  strategyCode: "conversation",
  strategyClassificationDescription:
    "The message in question is a regular conversation or inquiry.",
  strategyPrompt:
    "Answer the following message briefly, just in a sentence or two. " +
    "Avoid using any specialized tools at your disposal unless absolutely required.",
  quality: "regular",
};

export const HARDCODED_STRATEGY_CODE_IGNORE = "ignore";
export const HARDCODED_STRATEGY_IGNORE: Omit<AnswerStrategyEntity, "chatId"> = {
  strategyCode: HARDCODED_STRATEGY_CODE_IGNORE,
  strategyClassificationDescription:
    "The message does not require a response. Use when conversation is " +
    "complete, there's nothing to add, or user is spamming the same messages " +
    "repeatedly without meaningfully contributing to the conversation.",
  /**
   * Do not use the actual prompt! Stop processing the trigger when this
   * strategy is selected.
   */
  strategyPrompt: "Do not answer the message.",
  quality: "low",
};

/**
 * Config subdocument for answer generation strategies per chat
 */
@Schema({ timestamps: true })
export class AnswerStrategyEntity {
  @Prop({ required: true, index: true })
  chatId: number;

  /**
   * Unique code of the strategy for enum classification
   */
  @Prop({ required: true })
  strategyCode: string;

  /**
   * For classification task – description of the strategy and in which cases it
   * should be used
   */
  @Prop({ required: true })
  strategyClassificationDescription: string;

  /**
   * Prompt to generate the answer according to the strategy, when the strategy
   * is selected
   */
  @Prop({ required: true })
  strategyPrompt: string;

  @Prop({ required: true, default: "regular" })
  quality: ModelQualityType;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AnswerStrategySchema =
  SchemaFactory.createForClass(AnswerStrategyEntity);
PersonEntitySchema.index({ chatId: 1, strategyCode: 1 }, { unique: true });
