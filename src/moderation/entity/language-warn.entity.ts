import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true })
export class LanguageWarnEntity {
  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  userId: number;

  /**
   * Increases with each ban, leads to longer bans
   */
  @Prop({ default: 0 })
  count: number;
}

export const LanguageWarnSchema =
  SchemaFactory.createForClass(LanguageWarnEntity);
LanguageWarnSchema.index({ chatId: 1, userId: 1 }, { unique: true });
