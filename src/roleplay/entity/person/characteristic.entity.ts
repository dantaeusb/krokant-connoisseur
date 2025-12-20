import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PersonCharacteristicDocument =
  HydratedDocument<PersonCharacteristicEntity>;

/**
 * Reason for rejecting a characteristic
 * - "duplicate": characteristic was already provided
 * - "conflicting": characteristic conflicts with existing knowledge
 *   in that case, either both characteristics are invalidated,
 *   or the one with higher importance is kept
 * - "irrelevant": characteristic is not relevant to the person's identity
 */
export type RejectionReason = "duplicate" | "conflicting" | "irrelevant";

@Schema({ timestamps: true })
export class PersonCharacteristicEntity {
  public static COLLECTION_NAME = "person_characteristic";

  @Prop({ required: true })
  characteristic: string;

  @Prop({ required: true, default: 0.33 })
  importance: number;

  @Prop({ required: true, default: false })
  rejected: boolean;

  @Prop()
  rejectionReason?: RejectionReason;

  @Prop({ required: true })
  date: Date;
}

export const PersonCharacteristicSchema = SchemaFactory.createForClass(
  PersonCharacteristicEntity
);
