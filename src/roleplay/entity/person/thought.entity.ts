import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PersonThoughtFactorValueEntity } from "@roleplay/entity/person/thought/factor-value.entity";
import { HydratedDocument } from "mongoose";

export type PersonThoughtDocument = HydratedDocument<PersonThoughtEntity>;

@Schema({ timestamps: true })
export class PersonThoughtEntity {
  public static COLLECTION_NAME = "person_thought";

  @Prop({ required: true })
  thought: string;

  @Prop({ required: true, default: 0 })
  opinionModifier: number;

  @Prop({ required: true, default: 1 })
  weight: number;

  @Prop({ required: true })
  factors: Array<PersonThoughtFactorValueEntity>;

  @Prop({ required: true })
  date: Date;
}

export const PersonThoughtSchema =
  SchemaFactory.createForClass(PersonThoughtEntity);
