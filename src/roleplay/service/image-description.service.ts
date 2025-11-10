import { Injectable, Logger } from "@nestjs/common";
import { Schema as GenAiOpenApiSchema, Type } from "@google/genai";
import { Update as TelegramUpdate } from "telegraf/types";
import { ConfigService } from "@core/service/config.service";
import { GeminiService } from "@genai/service/gemini.service";
import { FileService } from "@core/service/file.service";
import { UserService } from "@core/service/user.service";
import { MessageService } from "@core/service/message.service";
import { ImageCheckService } from "@moderation/service/image-check.service";
import { PromptService } from "./prompt.service";

type ImageDescription = {
  description: string;
  explanation?: string;
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
    private readonly userService: UserService,
    private readonly messageService: MessageService,
    private readonly imageCheckService: ImageCheckService,
    private readonly promptService: PromptService
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

    const users = await this.userService.getActiveUsersInChat(chatId, 10);

    const [characterPrompt, participantsPrompt, situationalPrompt] =
      await Promise.all([
        this.promptService.getPromptFromChatCharacter(chatId),
        this.promptService.getPromptForUsersParticipants(users),
        this.promptService.getSituationalPrompt(users),
      ]);

    const result = await this.geminiService.describeImage(
      file.data,
      [...characterPrompt, ...participantsPrompt, ...situationalPrompt],
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
        explanation: {
          type: Type.STRING,
          description:
            "If the image contains any important non-background text in a language other than English, use the given persona description to explain the image. If there is no such text, leave this field empty.",
          example:
            'a question box and a rather unhelpful response to an Italian phrase: "Speravo de morì prima," which translates to "I hoped to die sooner." ' +
            'The response, of course, dismisses understanding Italian and offers a generic "happy for you/sorry that happened." ' +
            "So, in essence, it's a rather typical anime aesthetic with a side of social media interaction, where the text completely misses the mark.",
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
