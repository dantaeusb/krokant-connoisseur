import { HydratedDocument } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type BanEventDocument = HydratedDocument<BanEventEntity>;

export type BanEventType = "mute" | "ban" | "self-mute" | "pardon";

@Schema({ timestamps: true })
export class BanEventEntity {
  /**
   * Increases with each ban, leads to longer bans
   */
  @Prop({ required: true })
  severity: number;

  @Prop({ required: true })
  type: BanEventType;

  @Prop()
  reason: string;

  @Prop()
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BanEventSchema = SchemaFactory.createForClass(BanEventEntity);