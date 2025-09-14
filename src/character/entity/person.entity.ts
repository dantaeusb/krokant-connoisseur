import { Prop, Schema } from "@nestjs/mongoose";

@Schema()
export class PersonEntity {
  @Prop()
  names: string[];

}