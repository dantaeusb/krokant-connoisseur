import { Injectable } from "@nestjs/common";
import { Message } from "node-telegram-bot-api";
import { Cron } from "@nestjs/schedule";
import { ModerationService } from "./moderation.service";
import { Context } from "../interfaces/context.interface";
import { redisClient } from "../core/core";
import emojiRegex from "emoji-regex";

@Injectable()
export class LanguageCheckService {
  private static ASCII_CHARACTERS = "\x20-\x7E"; // Basic ASCII characters
  private static ENGLISH_LETTERS = "A-Za-z"; // English letters only
  private static DIGITS = "0-9"; // Digits
  private static COMMON_SYMBOLS =
    "!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?`~"; // Common symbols
  private static MATH_SYMBOLS = "\u2200-\u22FF"; // Mathematical operators
  private static FORMATTING_SYMBOLS = "\u2000-\u206F"; // Formatting symbols

  private static REDIS_COUNT_KEY = "non_english_messages";
  private static ALLOWED_PATTERN = new RegExp(
    `^[${LanguageCheckService.ASCII_CHARACTERS}${LanguageCheckService.ENGLISH_LETTERS}${LanguageCheckService.DIGITS}${LanguageCheckService.COMMON_SYMBOLS}${LanguageCheckService.MATH_SYMBOLS}${LanguageCheckService.FORMATTING_SYMBOLS}]*$`,
    "u"
  );

  constructor(private readonly moderationService: ModerationService) {}

  public async checkLanguageInMessages(context: Context): Promise<boolean> {
    console.log(context.text ?? context.message);

    if (!context.text || !context.from) {
      return;
    }

    const userId = context.from.id;
    const userKey = `user:${userId}:${LanguageCheckService.REDIS_COUNT_KEY}`;

    if (this.containsDisallowedCharacters(context.text)) {
      try {
        const currentCount = await redisClient.incr(userKey);

        if (currentCount > 3) {
          this.moderationService.warnUser(
            context.from,
            context.chat.id,
            "Use English",
            context.message as Message
          );
          await redisClient.set(userKey, "0"); // Reset the specific counter after a warning
        } else {
          context.react("👀");
        }
      } catch (err) {
        console.error("Redis error:", err);
      }
    }
  }

  private removeEmojis(text: string): string {
    const emojiPattern = emojiRegex();
    return text.replace(emojiPattern, "");
  }

  private containsDisallowedCharacters(messageText: string): boolean {
    const textWithoutEmojis = this.removeEmojis(messageText);

    return !LanguageCheckService.ALLOWED_PATTERN.test(textWithoutEmojis);
  }

  @Cron("0 * * * *")
  public async cooldownLanguageWarnings() {
    try {
      const keys = await redisClient.keys(`user:*:${LanguageCheckService.REDIS_COUNT_KEY}`);
      if (keys.length > 0) {
        for (const key of keys) {
          await redisClient.decr(key);
          console.log("Daily reset: Cleared all user message counts.");
        }
      }
    } catch (err) {
      console.error("Redis error during daily reset:", err);
    }
  }
}
