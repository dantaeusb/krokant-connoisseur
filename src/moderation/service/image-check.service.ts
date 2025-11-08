import { Injectable } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import {
  BanResult,
  ModerationService,
  WarnResult,
} from "@moderation/service/moderation.service";
import { Update as TelegramUpdate } from "telegraf/types";

export type ImageFlagAction =
  | "Ignore"
  | "Spoiler"
  | "Warn"
  | "WarnDelete"
  | "Ban";

export type ImageFlag = {
  code: string;
  description: string;
  action: ImageFlagAction;
};

@Injectable()
export class ImageCheckService {
  private static readonly FLAGS: Array<ImageFlag> = [
    {
      code: "Nudity",
      description: "The image contains naked human body.",
      action: "Spoiler",
    },
    {
      code: "Sex",
      description: "The image contains sexual act or intercourse.",
      action: "Warn",
    },
    {
      code: "Violence",
      description: "The image shows acts of violence or physical harm.",
      action: "Ignore",
    },
    {
      code: "HateSymbols",
      description:
        "The image includes symbols associated with hate groups or ideologies.",
      action: "Ignore",
    },
    {
      code: "SelfHarm",
      description: "The image portrays self-harm or suicidal behavior.",
      action: "Ignore",
    },
    {
      code: "Gore",
      description: "The image contains graphic depictions of injury or death.",
      action: "Ban",
    },
    {
      code: "ChildExploitation",
      description: "The image involves the exploitation or abuse of minors.",
      action: "Ban",
    },
  ];

  private flagsByAction: Partial<Record<ImageFlagAction, Array<ImageFlag>>> =
    ImageCheckService.FLAGS.reduce((acc, flag) => {
      if (!acc[flag.action]) {
        acc[flag.action] = [];
      }
      acc[flag.action]!.push(flag);
      return acc;
    }, {} as Partial<Record<ImageFlagAction, Array<ImageFlag>>>);

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>,
    private readonly moderationService: ModerationService
  ) {}

  public getFlags(): Array<ImageFlag> {
    return ImageCheckService.FLAGS;
  }

  public async checkImageFlags(
    chatId: number,
    userId: number,
    messageId: number,
    messageUpdate:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"],
    flagsParam: Array<string>
  ): Promise<ImageCheckResult> {
    if (flagsParam.length === 0) {
      return ImageCheckResult.NONE;
    }

    const flags = ImageCheckService.FLAGS.filter((flag) =>
      flagsParam.includes(flag.code)
    );

    const bannableFlags = flags.filter((flag) =>
      this.flagsByAction["Ban"]?.some((f) => f.code === flag.code)
    );

    if (bannableFlags.length > 0) {
      const result = await this.moderationService.banUser(
        chatId,
        userId,
        false,
        `Image contained banned content: ${bannableFlags
          .map((flag) => flag.description)
          .join(", ")}`
      );

      await this.bot.telegram.deleteMessage(chatId, messageId);

      switch (result) {
        case BanResult.MUTED:
          return ImageCheckResult.MUTED;
        case BanResult.BANNED:
          return ImageCheckResult.MUTED;
        case BanResult.PERMA_BANNED:
          return ImageCheckResult.PERMA_BANNED;
      }

      return ImageCheckResult.NONE;
    }

    const warningFlags = flags.filter((flag) =>
      this.flagsByAction["Warn"]?.some((f) => f.code === flag.code)
    );

    const warningDeleteFlags = flags.filter((flag) =>
      this.flagsByAction["WarnDelete"]?.some((f) => f.code === flag.code)
    );

    if (warningFlags.length > 0 || warningDeleteFlags.length > 0) {
      const result = await this.moderationService.warnUser(
        chatId,
        userId,
        undefined,
        `Image contained flagged content: ${warningFlags
          .map((flag) => flag.description)
          .join(", ")}`
      );

      if (warningDeleteFlags.length > 0) {
        await this.bot.telegram.deleteMessage(chatId, messageId);
      }

      switch (result) {
        case WarnResult.WARNED:
          return ImageCheckResult.WARNED;
        case WarnResult.MUTED:
          return ImageCheckResult.MUTED;
        case WarnResult.PERMA_BANNED:
          return ImageCheckResult.PERMA_BANNED;
      }

      return ImageCheckResult.NONE;
    }

    const spoilerFlags = flags.filter((flag) =>
      this.flagsByAction["Spoiler"]?.some((f) => f.code === flag.code)
    );

    if (
      spoilerFlags.length > 0 &&
      "photo" in messageUpdate &&
      !messageUpdate.has_media_spoiler
    ) {
      const [result] = await Promise.all([
        await this.moderationService.warnUser(
          chatId,
          userId,
          undefined,
          `Image should have had a spoiler: ${warningFlags
            .map((flag) => flag.description)
            .join(", ")}`
        ),
        this.bot.telegram.deleteMessage(chatId, messageId),
        this.bot.telegram.sendPhoto(
          chatId,
          messageUpdate.photo!.slice(-1)[0].file_id,
          {
            message_thread_id: messageUpdate.message_thread_id,
            has_spoiler: true,
          }
        ),
      ]);

      switch (result) {
        case WarnResult.MUTED:
          return ImageCheckResult.MUTED;
        case WarnResult.PERMA_BANNED:
          return ImageCheckResult.PERMA_BANNED;
      }
    }

    return ImageCheckResult.NONE;
  }
}

export enum ImageCheckResult {
  NONE = "none",
  WARNED = "warned",
  MUTED = "banned",
  PERMA_BANNED = "perma_banned",
}
