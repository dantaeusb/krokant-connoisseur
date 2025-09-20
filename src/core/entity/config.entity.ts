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

  @Prop({ default: "" })
  characterExtraPrompt: string;

  /**
   * This will be used as a system prompt for the character actions,
   * i.e. replies and rephrasings, or any other user interactions if
   * enabled.
   */
  @Prop({ default: "" })
  characterPrompt: string;

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
  summarizerPrompt: string;

  @Prop([PingGroupSchema])
  pingGroups: Array<PingGroupEntity>;

  @Prop([ProfanityFilterSchema])
  profanityFilters: Array<ProfanityFilterEntity>;

  @Prop({ default: false })
  debugMode: boolean;
}

export const ConfigSchema = SchemaFactory.createForClass(ConfigEntity);
