import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true })
export class PersonThoughtFactorValueEntity {
  public static COLLECTION_NAME = "person_thought_factor_value";

  @Prop({ required: true })
  factor: string;

  @Prop({ required: true })
  value: number;
}

export const PersonThoughtFactorValueEntitySchema =
  SchemaFactory.createForClass(PersonThoughtFactorValueEntity);
