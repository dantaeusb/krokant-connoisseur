import { Injectable, Logger } from "@nestjs/common";
import { Context, Telegraf } from "telegraf";
import { Update } from "telegraf/types";
import { ParseMode, Message } from "@telegraf/types/message";
import { InjectModel } from "@nestjs/mongoose";
import { InjectBot } from "nestjs-telegraf";
import { Model, pluralize } from "mongoose";
import { ClankerBotName } from "@/app.constants";
import { MessageDocument, MessageEntity } from "@core/entity/message.entity";
import { ConfigService } from "./config.service";
import { UserService } from "./user.service";
import { FormatterService } from "./formatter.service";
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";

/**
 * General message utilities.
 */
@Injectable()
export class MessageService {
  public static readonly HIDDEN_MESSAGE_TEXT = "[Hidden by user preference]";
  /**
   * 36 hours - time window to consider messages for conversation summarization.
   * Messages before this period could be summarized into a single prompt.
   */
  public static readonly CONVERSATION_SUMMARIZATION_WINDOW_MS =
    36 * 60 * 60 * 1000;

  /**
   * If there are less messages than this threshold in the summarization window,
   * we won't summarize them yet.
   */
  public static readonly MESSAGE_SUMMARIZATION_THRESHOLD = 700;

  /**
   * Telegram message length limit. If message exceeds this length, it needs to be
   * split into multiple messages. We'll try to split on sensible boundaries,
   * first trying double newlines, then single newlines, then sentence-ending
   * punctuation, and finally just spaces. If none of these are found,
   * we'll have to split at the max length.
   */
  public static readonly TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
  private static readonly MESSAGE_BREAK_SYMBOLS = [
    "\n\n",
    "\n",
    "? ",
    "! ",
    ". ",
    " ",
  ];

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
   * @param extra
   * @param avoidPings
   */
  public async sendMessage(
    chatId: number,
    text: string,
    extra?: ExtraReplyMessage,
    avoidPings = true
  ): Promise<Message.TextMessage> {
    if (avoidPings) {
      text = this.formatterService.escapeHandles(text);
    }

    const splitTexts = this.splitAndEscapeMessage(text);
    let lastMessage: Message.TextMessage | null = null;

    for (const splitText of splitTexts) {
      this.logger.debug(splitText);

      const message = await this.bot.telegram.sendMessage(chatId, splitText, {
        ...extra,
        parse_mode: extra?.parse_mode ?? "MarkdownV2",
        link_preview_options: {
          is_disabled: true,
          // Following doesn't work so I left disabling it completely.
          prefer_small_media: true,
          prefer_large_media: false,
          ...extra?.link_preview_options,
        },
      });

      lastMessage = message;
    }

    // @todo: [MED] Record real messages, without formatting escapes.
    this.recordOwnMessage(
      chatId,
      lastMessage.message_id,
      text,
      lastMessage.reply_to_message?.message_id || null,
      lastMessage.date
    ).catch((error) => {
      this.logger.error("Failed to record bot message:", error);
    });

    return lastMessage;
  }

  /**
   * @param text
   * @param parseMode
   */
  public splitAndEscapeMessage(text: string): Array<string> {
    const segments: string[] = [];
    let remainingText = text;

    while (remainingText.length > MessageService.TELEGRAM_MAX_MESSAGE_LENGTH) {
      let splitIndex = -1;

      for (const symbol of MessageService.MESSAGE_BREAK_SYMBOLS) {
        const index = remainingText.lastIndexOf(
          symbol,
          MessageService.TELEGRAM_MAX_MESSAGE_LENGTH
        );

        if (index !== -1) {
          splitIndex = index + symbol.length;
          break;
        }
      }

      if (splitIndex === -1) {
        splitIndex = MessageService.TELEGRAM_MAX_MESSAGE_LENGTH;
      }

      let segment = remainingText.slice(0, splitIndex).trim();
      segment = this.formatterService.escapeMarkdown(segment);

      segments.push(segment);
      remainingText = remainingText.slice(splitIndex).trim();
    }

    if (remainingText.length > 0) {
      let segment = remainingText;
      segment = this.formatterService.escapeMarkdown(segment);

      segments.push(segment);
    }

    return segments;
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

  public async updateMessage(
    context: Context<Update.EditedMessageUpdate>
  ): Promise<MessageDocument | void> {
    const edited = context.update.edited_message;

    if (!context.update.edited_message) {
      return;
    }

    const message = await this.messageEntityModel.findOne({
      chatId: edited.chat.id,
      messageId: edited.message_id,
    });

    if (!message) {
      this.logger.warn(
        `Message not found for update: chatId=${edited.chat.id}, messageId=${edited.message_id}`
      );
      return;
    }

    if ("text" in edited && edited.text) {
      if (message.text != "[Hidden by user preference]") {
        message.text = edited.text;
      }
    }

    return message.save().catch((error) => {
      this.logger.error("Failed to update message:", error);
    });
  }

  public async recordMessage(
    context: Context<Update.MessageUpdate>
  ): Promise<MessageDocument | void> {
    if (!context.message || !context.text) {
      return;
    }

    const message: MessageEntity = {
      chatId: context.chat.id,
      messageId: context.message.message_id,
      userId: context.message.from.id,
      text: context.text,
      date: new Date(context.message.date * 1000),
      conversationIds: null,
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
  ): Promise<MessageDocument | void> {
    if (!context.message) {
      return;
    }

    const message: MessageEntity = {
      chatId: context.chat.id,
      messageId: context.message.message_id,
      userId: context.message.from.id,
      text: MessageService.HIDDEN_MESSAGE_TEXT,
      date: new Date(context.message.date * 1000),
      conversationIds: null,
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
  ): Promise<MessageDocument | void> {
    const message: MessageEntity = {
      chatId: chatId,
      messageId: messageId,
      userId: this.configService.botId,
      text: text,
      date: new Date(date * 1000),
      conversationIds: null,
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
  ): Promise<Array<MessageDocument>> {
    return this.messageEntityModel
      .find({ chatId: chatId })
      .sort({ date: -1 })
      .limit(limit)
      .exec();
  }

  public async getOldestUnprocessedMessages(
    chatId: number,
    limit: number
  ): Promise<Array<MessageDocument>> {
    const messages = await this.messageEntityModel
      .find({
        chatId: chatId,
        conversationIds: null,
        date: {
          $lt: new Date(
            Date.now() - MessageService.CONVERSATION_SUMMARIZATION_WINDOW_MS
          ),
        },
      })
      .sort({ date: 1 })
      .limit(limit)
      .exec();

    if (messages.length < MessageService.MESSAGE_SUMMARIZATION_THRESHOLD) {
      return [];
    }

    return messages;
  }

  public async addConversationIdToMessages(
    chatId: number,
    messageIds: Array<number>,
    conversationId: number
  ): Promise<number> {
    const result = await this.messageEntityModel
      .updateMany({ chatId: chatId, messageId: { $in: messageIds } }, [
        {
          $set: {
            conversationIds: {
              $cond: {
                if: { $isArray: "$conversationIds" },
                then: { $concatArrays: ["$conversationIds", [conversationId]] },
                else: [conversationId],
              },
            },
          },
        },
      ])
      .exec();

    this.logger.log(
      `Updated ${result.modifiedCount} messages in chat ${chatId} with conversation ID ${conversationId}`
    );

    return result.modifiedCount;
  }

  public async getMessageChain(
    chatId: number,
    messageId: number
  ): Promise<Array<MessageDocument>> {
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

  /**
   * Updates all messages for a specific user to hide their content.
   * Used by the forgetme command to anonymize user data.
   * @param chatId The chat ID to search in
   * @param userId The user ID whose messages to hide
   * @returns The number of messages updated
   */
  public async hideUserMessages(
    chatId: number,
    userId: number
  ): Promise<number> {
    const result = await this.messageEntityModel
      .updateMany(
        { chatId: chatId, userId: userId },
        { text: "[Hidden by user preference]" }
      )
      .exec();

    this.logger.log(
      `Hidden ${result.modifiedCount} messages for user ${userId} in chat ${chatId}`
    );

    return result.modifiedCount;
  }
}
