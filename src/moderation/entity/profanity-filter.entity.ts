import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ProfanityFilterDocument = HydratedDocument<ProfanityFilterEntity>;

@Schema({ timestamps: true })
export class ProfanityFilterEntity {
  public static COLLECTION_NAME = "profanity_filter";

  @Prop({ type: String })
  filter: string;

  @Prop({ type: String })
  regexp?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProfanityFilterSchema = SchemaFactory.createForClass(
  ProfanityFilterEntity
);
