import { Injectable, Logger } from "@nestjs/common";
import { Context, Telegraf } from "telegraf";
import { Update } from "telegraf/types";
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";
import { ParseMode, Message } from "@telegraf/types/message";
import { InjectModel } from "@nestjs/mongoose";
import { InjectBot } from "nestjs-telegraf";
import { Model, pluralize } from "mongoose";
import { ClankerBotName } from "@/app.constants";
import {
  HydratedMessageDocument,
  MessageEntity,
} from "@core/entity/message.entity";
import { ConfigService } from "./config.service";
import { UserService } from "./user.service";
import { FormatterService } from "./formatter.service";

/**
 * General message utilities.
 */
@Injectable()
export class MessageService {
  public static readonly HIDDEN_MESSAGE_TEXT = "[Hidden by user preference]";

  private readonly logger = new Logger("Core/MessageService");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    @InjectModel(MessageEntity.COLLECTION_NAME)
    private messageEntityModel: Model<MessageEntity>,
    private readonly formatterService: FormatterService,
    private readonly configService: ConfigService,
    private readonly userService: UserService
  ) {}

  /**
   * Sends a message through Telegram API and records it in the database to keep
   * track of conversation history.
   * @param chatId
   * @param text
   * @param parseMode
   * @param extra
   */
  public async sendMessage(
    chatId: number,
    text: string,
    extra?: ExtraReplyMessage
  ): Promise<Message.TextMessage> {
    if (extra && "parseMode" in extra && extra.parseMode === "Markdown") {
      text = this.formatterService.escapeMarkdown(text);
    }

    const message = await this.bot.telegram.sendMessage(chatId, text, {
      ...extra,
    });

    this.recordOwnMessage(
      chatId,
      message.message_id,
      text,
      message.reply_to_message?.message_id || null,
      message.date
    ).catch((error) => {
      this.logger.error("Failed to record bot message:", error);
    });

    return message;
  }

  public async getTargetUserFromMessage(
    context: Context<Update.MessageUpdate>
  ): Promise<number | null> {
    const mentionEntities = context.entities("text_mention", "mention");

    for (const entity of mentionEntities) {
      if (entity.type === "mention") {
        const username = this.extractUsernameFromHandle(entity.fragment);

        if (!username) {
          this.logger.log(
            `Invalid username format in mention entity: ${entity.fragment}`
          );
          continue;
        }

        const user = await this.userService.getUserByUsername(
          context.chat.id,
          this.extractUsernameFromHandle(entity.fragment)
        );

        if (user) {
          this.logger.log(
            `Using mention entity for target user: ${entity.fragment} -> ${user.userId}`
          );
          return user.userId;
        } else {
          this.logger.log(
            `Mention entity for target user not found in database: ${entity.fragment}`
          );

          continue;
        }
      }

      if (entity.type === "text_mention" && entity.user) {
        this.logger.log(
          `Using text_mention entity for target user: ${entity.user.id}`
        );
        return entity.user.id;
      }
    }

    if (
      "message" in context.update &&
      "reply_to_message" in context.update.message
    ) {
      this.logger.log(
        `Using reply_to_message for target user: ${context.update.message.reply_to_message.from.id}`
      );
      return context.update.message.reply_to_message.from.id;
    }

    return null;
  }

  public extractUsernameFromHandle(handle: string): string | null {
    let supposedHandle = handle.trim();

    if (supposedHandle.startsWith("@") && supposedHandle.length > 1) {
      supposedHandle = supposedHandle.slice(1);
    }

    if (/^[a-zA-Z0-9_]{5,32}$/.test(supposedHandle)) {
      return supposedHandle;
    }

    return null;
  }

  public async recordMessage(
    context: Context<Update.MessageUpdate>
  ): Promise<HydratedMessageDocument | void> {
    if (!context.message || !context.text) {
      return;
    }

    const message: MessageEntity = {
      chatId: context.chat.id,
      messageId: context.message.message_id,
      userId: context.message.from.id,
      text: context.text,
      date: new Date(context.message.date * 1000),
    };

    if (
      "forward_origin" in context.message &&
      context.message.forward_origin &&
      "sender_user" in context.message.forward_origin
    ) {
      message.forwardedFromUserId =
        context.message.forward_origin.sender_user.id;
    }

    if (
      "reply_to_message" in context.message &&
      context.message.reply_to_message
    ) {
      message.replyToMessageId = context.message.reply_to_message.message_id;
    }

    return this.messageEntityModel.create(message).catch((error) => {
      this.logger.error("Failed to record message:", error);
    });
  }

  /**
   * Records a message with hidden text if user preferred to not opt-in in
   * bot conversations. Tried without it, but then bot hallucinates about
   * other messages and loses conversation threads. It works better when
   * it at least knows that something was said. - @dantaeusb
   * @param context
   */
  public async recordHiddenMessage(
    context: Context<Update.MessageUpdate>
  ): Promise<HydratedMessageDocument | void> {
    if (!context.message) {
      return;
    }

    const message: MessageEntity = {
      chatId: context.chat.id,
      messageId: context.message.message_id,
      userId: context.message.from.id,
      text: MessageService.HIDDEN_MESSAGE_TEXT,
      date: new Date(context.message.date * 1000),
    };

    if (
      "forward_origin" in context.message &&
      context.message.forward_origin &&
      "sender_user" in context.message.forward_origin
    ) {
      message.forwardedFromUserId =
        context.message.forward_origin.sender_user.id;
    }

    if (
      "reply_to_message" in context.message &&
      context.message.reply_to_message
    ) {
      message.replyToMessageId = context.message.reply_to_message.message_id;
    }

    return this.messageEntityModel.create(message).catch((error) => {
      this.logger.error("Failed to record hidden message:", error);
    });
  }

  public async recordOwnMessage(
    chatId: number,
    messageId: number,
    text: string,
    replyToMessageId: number | null,
    date: number
  ): Promise<HydratedMessageDocument | void> {
    const message: MessageEntity = {
      chatId: chatId,
      messageId: messageId,
      userId: this.configService.botId,
      text: text,
      date: new Date(date * 1000),
    };

    if (replyToMessageId) {
      message.replyToMessageId = replyToMessageId;
    }

    return this.messageEntityModel.create(message).catch((error) => {
      this.logger.error("Failed to record bot message:", error);
    });
  }

  public async getLatestMessages(
    chatId: number,
    limit: number
  ): Promise<MessageEntity[]> {
    return this.messageEntityModel
      .find({ chatId: chatId })
      .sort({ date: -1 })
      .limit(limit)
      .exec();
  }

  public async getMessageChain(
    chatId: number,
    messageId: number
  ): Promise<MessageEntity[]> {
    const pipeline = [
      {
        $match: {
          chatId: chatId,
          messageId: messageId,
        },
      },
      {
        $graphLookup: {
          from: pluralize()(MessageEntity.COLLECTION_NAME),
          startWith: "$replyToMessageId",
          connectFromField: "replyToMessageId",
          connectToField: "messageId",
          as: "replyChain",
          maxDepth: 100,
          restrictSearchWithMatch: {
            chatId: chatId,
          },
        },
      },
    ];

    const result = await this.messageEntityModel.aggregate(pipeline).exec();

    if (result.length === 0) {
      return [];
    }

    const rootMessage = result[0];
    return [rootMessage, ...rootMessage.replyChain];
  }
}
