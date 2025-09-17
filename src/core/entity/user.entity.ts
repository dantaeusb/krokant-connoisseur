import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { BanEntity } from "@moderation/entity/ban.entity";
import { WarnEntity } from "@moderation/entity/warn.entity";
import { PersonEntity } from "@character/entity/person.entity";
import mongoose from "mongoose";

@Schema({ timestamps: true })
export class UserEntity {
  public static COLLECTION_NAME = "user";

  @Prop({ required: true, index: true })
  chatId: number;

  @Prop({ required: true, index: true })
  userId: number;

  @Prop()
  username?: string;

  /**
   * Do not log activity and messages for this user
   */
  @Prop({ default: false })
  ignore: boolean;

  @Prop()
  name: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: "CharacterEntity" })
  character: PersonEntity;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: "WarnEntity" })
  warn: WarnEntity;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: "BanEntity" })
  ban: BanEntity;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
UserSchema.index({ chatId: 1, userId: 1 }, { unique: true });
