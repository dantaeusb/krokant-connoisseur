import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

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

  @Prop()
  characterExtraPrompt: string;

  @Prop({ default: "" })
  systemPrompt: string;
}

export const ConfigSchema = SchemaFactory.createForClass(ConfigEntity);