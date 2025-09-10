import { Injectable, Logger } from "@nestjs/common";
import { User } from "telegraf/typings/core/types/typegram";
import { Message } from "node-telegram-bot-api";
import { bot, redisClient } from "../core/core";
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";

const WARN_LIMIT = 3;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger("Moderation/Service");

  getWarningKey(userId: number) {
    return `user:${userId}:warnings`;
  }

  async warnUser(
    user: User,
    chatId: number,
    reason: string,
    replyTo?: Message
  ): Promise<number> {
    const warningKey = this.getWarningKey(user.id);
    const currentWarnings = await redisClient.incr(warningKey);

    let messageParameters: ExtraReplyMessage = {};

    if (replyTo) {
      messageParameters = {
        reply_parameters: {
          message_id: replyTo.message_id,
          chat_id: chatId,
          allow_sending_without_reply: true,
        },
      };
    }

    bot.telegram.sendSticker(
      chatId,
      "CAACAgIAAxkBAAMtaMCj9huqEnlcLNC0Q-AlpGt9XwIAAj5tAALGK4BLkonz2kRJC4c2BA"
    );

    if (currentWarnings > WARN_LIMIT) {
      await bot.telegram.sendMessage(
        chatId,
        `User ${user.first_name} has been warned ${currentWarnings} times and has exceeded the limit of ${WARN_LIMIT}.`,
        messageParameters
      );
    } else {
      await bot.telegram.sendMessage(
        chatId,
        `Warning for ${user.first_name}: ${reason}. Total warnings: ${currentWarnings}.`,
        messageParameters
      );
    }

    return currentWarnings;
  }
}
