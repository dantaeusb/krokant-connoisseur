import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PingGroupDocument = HydratedDocument<PingGroupEntity>;

@Schema({ timestamps: true })
export class PingGroupEntity {
  public static COLLECTION_NAME = "ping_group";

  @Prop({ required: true, index: true })
  handle: string;

  @Prop({})
  userIds: number[];
}

export const PingGroupSchema = SchemaFactory.createForClass(PingGroupEntity);
