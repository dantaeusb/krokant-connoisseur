import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
export class BanEntity {
  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  userId: number;

  /**
   * Increases with each ban, leads to longer bans
   */
  @Prop()
  severity: number;

  @Prop()
  reason: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const BanSchema = SchemaFactory.createForClass(BanEntity);
BanSchema.index({ chatId: 1, userId: 1 }, { unique: true });
