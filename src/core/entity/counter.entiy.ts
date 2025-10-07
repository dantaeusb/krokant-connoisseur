import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type CounterDocument = HydratedDocument<CounterEntity>;

@Schema({ timestamps: true })
export class CounterEntity {
  public static COLLECTION_NAME = "counter";

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, default: 0 })
  sequence: number;
}

export const CounterEntitySchema = SchemaFactory.createForClass(CounterEntity);
CounterEntitySchema.index({ name: 1 }, { unique: true });