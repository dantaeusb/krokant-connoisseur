import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  PersonThoughtEntity,
  PersonThoughtSchema,
} from "@character/entity/person/thought.entity";

/**
 * Person is related to User, but contains information about the person
 * for roleplaying responses and interactions
 */
@Schema({ timestamps: true })
export class PersonEntity {
  public static COLLECTION_NAME = "person";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  userId: number;

  /**
   * Other names or nicknames for the person
   */
  @Prop()
  names: Array<string>;

  /**
   * Facts about the person
   */
  @Prop()
  characteristics: Array<string>;

  /**
   * How much knowledge accumulated about the person
   */
  @Prop({ default: 0 })
  knowledge: number;

  @Prop({ default: 0 })
  interactionsCount: number;

  /**
   * Rimworld-like list of thoughts depending on actions and events
   */
  @Prop([PersonThoughtSchema])
  thoughts: Array<PersonThoughtEntity>;
}

export const PersonEntitySchema = SchemaFactory.createForClass(PersonEntity);
PersonEntitySchema.index({ chatId: 1, userId: 1 }, { unique: true });
