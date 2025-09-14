import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true })
export class WarnEntity {
  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  userId: number;

  @Prop({ default: 0 })
  count: number;
}

export const WarnSchema = SchemaFactory.createForClass(WarnEntity);
WarnSchema.index({ chatId: 1, userId: 1 }, { unique: true });
