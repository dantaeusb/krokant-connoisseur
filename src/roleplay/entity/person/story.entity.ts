import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PersonStoryDocument =
  HydratedDocument<PersonStoryEntity>;

@Schema({ timestamps: true })
export class PersonStoryEntity {
  public static COLLECTION_NAME = "person_story";

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  date: Date;

  /**
   * How much that story contributed to the correct and engaging
   * interpretation of an individual's personality (0-1)
   */
  @Prop()
  evaluation: number;
}

export const PersonStorySchema = SchemaFactory.createForClass(
  PersonStoryEntity
);
