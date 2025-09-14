import { bot } from "../core/core";
import { User } from "telegraf/typings/core/types/typegram";
import { Message } from "node-telegram-bot-api";
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";

export const banUser = async (
  user: User,
  chatId: number,
  durationHours: number,
  reason: string,
  replyTo?: Message
) => {
  const untilDate = Math.floor(Date.now() / 1000) + durationHours * 3600;

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

  try {
    await bot.telegram.banChatMember(chatId, user.id, untilDate);
    await bot.telegram.sendMessage(
      chatId,
      `User ${user.first_name} has been banned for ${durationHours} hours. Reason: ${reason}`,
      messageParameters
    );
  } catch (error) {
    console.error(`Failed to ban user ${user.id} in chat ${chatId}:`, error);
    await bot.telegram.sendMessage(
      chatId,
      `Failed to ban ${user.first_name}.`,
      messageParameters
    );
  }
};
