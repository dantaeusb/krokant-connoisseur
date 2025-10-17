import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { BanEventDocument, BanEventSchema } from "./ban/event.entity";

export type BanDocument = HydratedDocument<BanEntity>;

@Schema({ timestamps: true })
export class BanEntity {
  public static COLLECTION_NAME = "ban";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  userId: number;

  /**
   * Increases with each ban, leads to longer bans
   */
  @Prop()
  severity: number;

  @Prop([BanEventSchema])
  events: Types.DocumentArray<BanEventDocument>;

  @Prop({ required: true })
  expiresAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const BanSchema = SchemaFactory.createForClass(BanEntity);
BanSchema.index({ chatId: 1, userId: 1 }, { unique: true });
