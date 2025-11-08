import { Injectable, Logger } from "@nestjs/common";
import { Context, Telegraf } from "telegraf";
import { Message } from "@telegraf/types/message";
import { InjectModel } from "@nestjs/mongoose";
import { InjectBot } from "nestjs-telegraf";
import { Model } from "mongoose";
import { BotName } from "@/app.constants";
import { MessageEntity } from "@core/entity/message.entity";
import { FileDocument, FileEntity } from "@core/entity/file.entity";
import { PhotoSize } from "node-telegram-bot-api";

/**
 * Downloading files.
 */
@Injectable()
export class FileService {
  public static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  private logger = new Logger("Core/FileService");

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>,
    @InjectModel(FileEntity.COLLECTION_NAME)
    private fileEntityModel: Model<FileEntity>,
    @InjectModel(MessageEntity.COLLECTION_NAME)
    private messageEntityModel: Model<MessageEntity>
  ) {}

  public getPhotoMessageBestCandidate(message: Message): PhotoSize | null {
    if (!("photo" in message) || message.photo.length === 0) {
      return null;
    }

    const suitablePhotos = message.photo.filter(
      (p) => p.file_size && p.file_size < FileService.MAX_FILE_SIZE_BYTES
    );

    if (suitablePhotos.length === 0) {
      return null;
    }

    return suitablePhotos.reduce((prev, current) => {
      return (current.file_size ?? 0) > (prev.file_size ?? 0) ? current : prev;
    });
  }

  public async getFile(
    fileUniqueId: string,
    fileId: string,
    mimeType: string,
    downloadIfNotExists = true
  ): Promise<FileDocument | null> {
    let file = await this.fileEntityModel.findOne({ fileUniqueId });

    if (!file && downloadIfNotExists) {
      file = await this.downloadFile(fileId, mimeType);
    }

    return file;
  }

  /**
   * Downloads a file from Telegram and saves it to the database.
   * @param fileId The file ID to download.
   * @param mimeType The type of the file.
   * @returns The saved MessageDocument.
   */
  public async downloadFile(
    fileId: string,
    mimeType: string
  ): Promise<FileDocument> {
    try {
      const file = await this.bot.telegram.getFile(fileId);
      const fileLink = await this.bot.telegram.getFileLink(file.file_id);

      const response = await fetch(fileLink.href);

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const fileBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);

      return await this.fileEntityModel.create({
        fileUniqueId: file.file_unique_id,
        mimeType,
        data: buffer,
      });
    } catch (error) {
      this.logger.error(`Failed to download or save file ${fileId}.`, error);
      throw error;
    }
  }

  public async describeFile(
    fileUniqueId: string,
    description: string
  ): Promise<FileDocument | null> {
    return this.fileEntityModel.findOneAndUpdate(
      { fileUniqueId },
      { description }
    );
  }
}
