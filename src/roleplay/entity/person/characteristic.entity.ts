import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PersonCharacteristicDocument =
  HydratedDocument<PersonCharacteristicEntity>;

@Schema({ timestamps: true })
export class PersonCharacteristicEntity {
  public static COLLECTION_NAME = "person_characteristic";

  @Prop({ required: true })
  characteristic: string;

  @Prop({ required: true, default: 0.5 })
  importance: number;

  @Prop({ required: true })
  date: Date;
}

export const PersonCharacteristicSchema = SchemaFactory.createForClass(
  PersonCharacteristicEntity
);
