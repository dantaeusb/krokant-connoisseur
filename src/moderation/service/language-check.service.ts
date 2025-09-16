import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ModerationService, WarnResult } from "./moderation.service";
import emojiRegex from "emoji-regex";
import { Context, Telegraf } from "telegraf";
import { InjectBot } from "nestjs-telegraf";
import { ClankerBotName } from "@/app.constants";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { LanguageWarnEntity } from "@moderation/entity/language-warn.entity";

@Injectable()
export class LanguageCheckService {
  private static ASCII_CHARACTERS = "\x20-\x7E"; // Basic ASCII characters
  private static ENGLISH_LETTERS = "A-Za-z"; // English letters only
  private static RUSSIAN_LETTERS = "\u0400-\u04FF"; // Cyrillic for Russian
  private static PORTUGUESE_LETTERS = "A-Za-z\u00C0-\u00FF"; // Latin-1 Supplement for Portuguese
  private static DIGITS = "0-9"; // Digits
  private static COMMON_SYMBOLS =
    "!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?`~\n"; // Common symbols
  private static MATH_SYMBOLS = "\u2200-\u22FF"; // Mathematical operators
  private static FORMATTING_SYMBOLS = "\u2000-\u206F"; // Formatting symbols

  private static SUPPORTED_LANGUAGES = ["en", "ru", "pt"];
  private static BASE_PATTERN_CHARS = `${LanguageCheckService.ASCII_CHARACTERS}${LanguageCheckService.DIGITS}${LanguageCheckService.COMMON_SYMBOLS}${LanguageCheckService.MATH_SYMBOLS}${LanguageCheckService.FORMATTING_SYMBOLS}`;
  private static LANGUAGE_CHARSETS = {
    en: LanguageCheckService.ENGLISH_LETTERS,
    ru: LanguageCheckService.RUSSIAN_LETTERS,
    pt: LanguageCheckService.PORTUGUESE_LETTERS,
  };

  private static LANGUAGE_WARN_THRESHOLD = [3, 7, 8];

  private languagePatterns: Record<string, RegExp> = {};

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    @InjectModel(LanguageWarnEntity.COLLECTION_NAME)
    private readonly languageWarnEntityModel: Model<LanguageWarnEntity>,
    private readonly moderationService: ModerationService
  ) {
    const numLanguages = LanguageCheckService.SUPPORTED_LANGUAGES.length;

    for (let i = 1; i < 1 << numLanguages; i++) {
      const subset = [];
      for (let j = 0; j < numLanguages; j++) {
        if ((i >> j) & 1) {
          subset.push(LanguageCheckService.SUPPORTED_LANGUAGES[j]);
        }
      }

      subset.sort();
      const key = subset.join("_");
      const languageChars = subset
        .map((lang) => LanguageCheckService.LANGUAGE_CHARSETS[lang])
        .join("");

      this.languagePatterns[key] = new RegExp(
        `^[${LanguageCheckService.BASE_PATTERN_CHARS}${languageChars}]*$`,
        "u"
      );
    }
  }

  public containsNonLanguageSymbols(
    text: string,
    languages: string[] = ["en"]
  ): boolean {
    const textWithoutEmojis = this.removeEmojis(text);

    const key = [...languages].sort().join("_");
    const pattern = this.languagePatterns[key];

    if (!pattern) {
      return false;
    }

    return !pattern.test(textWithoutEmojis);
  }

  public async warnUserForLanguage(
    chatId: number,
    userId: number
  ): Promise<LanguageWarnResult> {
    const languageWarning = await this.languageWarnEntityModel
      .findOne({ chatId: chatId, userId: userId })
      .exec();

    if (!languageWarning) {
      const newWarning = new this.languageWarnEntityModel({
        chatId: chatId,
        userId: userId,
        count: 1,
      });
      await newWarning.save();
      return LanguageWarnResult.FIRST_WARNED;
    }

    languageWarning.count++;
    await languageWarning.save();

    if (
      LanguageCheckService.LANGUAGE_WARN_THRESHOLD.includes(
        languageWarning.count
      )
    ) {
      const result = await this.moderationService.warnUser(
        chatId,
        userId,
        "Use English."
      );

      const maxCount =
        LanguageCheckService.LANGUAGE_WARN_THRESHOLD[
          LanguageCheckService.LANGUAGE_WARN_THRESHOLD.length - 1
        ];

      if (
        result === WarnResult.BANNED ||
        result === WarnResult.PERMA_BANNED ||
        languageWarning.count === maxCount
      ) {
        await languageWarning.deleteOne();
      }
    }

    return LanguageWarnResult.NONE;
  }

  private removeEmojis(text: string): string {
    return text.replace(emojiRegex as unknown as RegExp, "");
  }

  @Cron("*/30 * * * *")
  public async cooldownLanguageWarnings() {
    const cooldownDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    await this.languageWarnEntityModel.updateMany(
      { updatedAt: { $lt: cooldownDate }, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    );
  }
}

export enum LanguageWarnResult {
  NONE = "none",
  FIRST_WARNED = "first_warned",
  SOFT_WARNED = "soft_warned",
  WARNED = "warned",
  BANNED = "banned",
  PERMA_BANNED = "perma_banned",
}
