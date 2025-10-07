import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  PingGroupEntity,
  PingGroupSchema,
} from "@core/entity/ping-group.entity";
import { HydratedDocument, Types } from "mongoose";
import {
  ProfanityFilterEntity,
  ProfanityFilterSchema,
} from "@moderation/entity/profanity-filter.entity";

export type ConfigDocument = HydratedDocument<
  ConfigEntity,
  {
    pingGroups: Types.Subdocument<Types.ObjectId> & PingGroupEntity;
  }
>;

/**
 * Chat config, effectively mongo just adds persistence to in-memory config.
 * Use `/reload` command to reload from DB if changes are made directly.
 */
@Schema({ timestamps: true })
export class ConfigEntity {
  public static COLLECTION_NAME = "config";

  @Prop({ required: true, index: true })
  chatId: number;

  /**
   * Whether the bot should be more likely to respond to messages in the chat
   * and rephrase messages from commands.
   */
  @Prop({ required: true, default: true })
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
      "a message to respond or rephrase.\n" +
      "Do not include message markers like [] or > in your responses.\n" +
      "Try to address users by their nicknames or names if possible, avoid using " +
      "handles or ID's unless the question better redirected to the person.\n",
  })
  characterSystemPrompt: string;

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
  @Prop({ default: "" })
  summarizerSystemPrompt: string;

  @Prop({ default: false })
  canGoogle: boolean;

  @Prop([PingGroupSchema])
  pingGroups: Array<PingGroupEntity>;

  @Prop([ProfanityFilterSchema])
  profanityFilters: Array<ProfanityFilterEntity>;

  @Prop({ default: false })
  debugMode: boolean;
}

export const ConfigSchema = SchemaFactory.createForClass(ConfigEntity);
