import { Prop, Schema } from "@nestjs/mongoose";

@Schema()
export class PersonEntity {
  public static COLLECTION_NAME = "person";

  @Prop()
  names: string[];

  @Prop()
  traits: string[];
}