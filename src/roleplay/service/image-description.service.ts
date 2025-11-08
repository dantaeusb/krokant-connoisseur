import { Injectable, Logger } from "@nestjs/common";
import { Schema as GenAiOpenApiSchema, Type } from "@google/genai";
import { Update as TelegramUpdate } from "telegraf/types";
import { ConfigService } from "@core/service/config.service";
import { GeminiService } from "@genai/service/gemini.service";
import { FileService } from "@core/service/file.service";
import { MessageService } from "@core/service/message.service";
import { ImageCheckService } from "@moderation/service/image-check.service";

type ImageDescription = {
  description: string;
  text?: string;
  flags: Array<string>;
};

@Injectable()
export class ImageDescriptionService {
  private logger: Logger = new Logger("Roleplay/ImageDescriptionService");

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly fileService: FileService,
    private readonly messageService: MessageService,
    private readonly imageCheckService: ImageCheckService
  ) {}

  public async getImageDescription(
    chatId: number,
    messageUpdate: TelegramUpdate.MessageUpdate["message"]
  ): Promise<ImageDescription> {
    const config = await this.configService.getConfig(chatId);

    const photoSize =
      this.fileService.getPhotoMessageBestCandidate(messageUpdate);
    const file = await this.fileService.getFile(
      photoSize.file_unique_id,
      photoSize.file_id,
      "image/jpeg"
    );

    const result = await this.geminiService.describeImage(
      file.data,
      this.getDescriptionSchema(),
      config.mediaDescriptionSystemPrompt
    );

    const classificationResponse: ImageDescription = JSON.parse(
      result.content.parts.map((part) => part.text || "").join("\n") ?? null
    );

    if (classificationResponse && classificationResponse.description) {
      this.fileService
        .describeFile(
          photoSize.file_unique_id,
          classificationResponse.description
        )
        .catch((err: Error) => {
          this.logger.error(
            `Failed to save description for file ${photoSize.file_unique_id}: ${err.message}`,
            err
          );
        });

      this.messageService
        .getMessage(chatId, messageUpdate.message_id)
        .then(async (message) => {
          if (message) {
            message.text =
              message.text +
              `\n\n[Image Description]: ${classificationResponse.description}`;

            await message.save();
          }
        })
        .catch((err: Error) => {
          this.logger.error(
            `Failed to append description to message ${messageUpdate.message_id}: ${err.message}`,
            err
          );
        });
    }

    return classificationResponse;
  }

  public getDescriptionSchema(): GenAiOpenApiSchema {
    return {
      type: Type.OBJECT,
      properties: {
        description: {
          type: Type.STRING,
          description:
            "A detailed description of the image content, including objects, scenery, actions, and any notable features. " +
            "If any text is present, it should be translated into English and explained in context.",
          example:
            "A serene landscape featuring a calm lake surrounded by tall pine trees under a clear blue sky with a few fluffy clouds.",
        },
        text: {
          type: Type.STRING,
          description:
            "Any text that is present within the image, transcribed exactly as it appears.",
          example: "Welcome to Sunnyvale Park",
        },
        flags: {
          type: Type.ARRAY,
          description:
            "An array of flags indicating specific attributes of the image content. Use only flags that exactly match description. " +
            "If the image contains text, ignore the text, only what is shown should be flagged. Can be empty. Use following possible values:\n" +
            this.imageCheckService
              .getFlags()
              .map((flag) => `- ${flag.code}: ${flag.description}`)
              .join("\n"),
          items: {
            type: Type.STRING,
            enum: this.imageCheckService.getFlags().map((flag) => flag.code),
          },
          minItems: "0",
          example: ["Nudity", "Sex"],
        },
      },
      required: ["description", "flags"],
    } as const satisfies GenAiOpenApiSchema;
  }
}
