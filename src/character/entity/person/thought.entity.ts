import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true })
export class PersonThoughtEntity {
  public static COLLECTION_NAME = "person_thought";

  @Prop({ required: true, default: 0 })
  opinionModifier: number;

  @Prop({ required: true })
  thought: string;
}

export const PersonThoughtSchema =
  SchemaFactory.createForClass(PersonThoughtEntity);
