import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type FileDocument = HydratedDocument<FileEntity>;

@Schema({ timestamps: true })
export class FileEntity {
  public static COLLECTION_NAME = "file";

  @Prop({ required: true, index: true })
  fileUniqueId: string;

  @Prop()
  description: string;

  @Prop()
  mimeType: string;

  @Prop({ type: Types.Buffer, required: true })
  data: Buffer;

  updatedAt?: Date;
  createdAt?: Date;
}

export const FileSchema = SchemaFactory.createForClass(FileEntity);
