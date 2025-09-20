import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Logger } from "@nestjs/common";

export type ProfanityFilterDocument = HydratedDocument<ProfanityFilterEntity>;

export type ProfanityFilterType = "text" | "regexp";

@Schema({ timestamps: true })
export class ProfanityFilterEntity {
  public static COLLECTION_NAME = "profanity_filter";

  @Prop({ type: String })
  type: ProfanityFilterType;

  @Prop({ type: String })
  filter: string | RegExp;
}

export const ProfanityFilterSchema = SchemaFactory.createForClass(
  ProfanityFilterEntity
);

const logger = new Logger("Moderation/ProfanityFilterEntity");

ProfanityFilterSchema.post<ProfanityFilterDocument>("init", function (doc) {
  if (doc.type === "regexp" && typeof doc.filter === "string") {
    try {
      const match = doc.filter.match(new RegExp("^/(.*?)/(.*)$"));
      if (match) {
        doc.filter = new RegExp(match[1], match[2]);
      } else {
        doc.filter = new RegExp(doc.filter);
      }
    } catch (e) {
      logger.error("Failed to parse regexp", doc.filter, e);
    }
  }
});
