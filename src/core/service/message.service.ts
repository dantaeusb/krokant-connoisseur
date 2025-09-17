import { Injectable, Logger } from "@nestjs/common";
import { Context } from "telegraf";
import { Update } from "telegraf/types";
import { UserService } from "@core/service/user.service";
import { InjectModel } from "@nestjs/mongoose";
import { Model, pluralize } from "mongoose";
import {
  HydratedMessageDocument,
  MessageEntity,
} from "@core/entity/message.entity";
import { ConfigService } from "@core/service/config.service";

/**
 * General message utilities.
 */
@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectModel(MessageEntity.COLLECTION_NAME)
    private messageEntityModel: Model<MessageEntity>,
    private readonly configService: ConfigService,
    private readonly userService: UserService
  ) {}

  public async getTargetUserFromMessage(
    context: Context<Update.MessageUpdate>
  ): Promise<number | null> {
    const mentionEntities = context.entities("text_mention", "mention");

    for (const entity of mentionEntities) {
      if (entity.type === "mention") {
        const user = await this.userService.getUserByUsername(
          context.chat.id,
          entity.fragment
        );
        if (user) {
          return user.userId;
        } else {
          return null;
        }
      }

      if (entity.type === "text_mention" && entity.user) {
        return entity.user.id;
      }
    }

    if (
      "message" in context.update &&
      "reply_to_message" in context.update.message
    ) {
      return context.update.message.reply_to_message.from.id;
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

  public async recordBotMessage(
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
