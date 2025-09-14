import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { WarnEntity } from "../entity/warn.entity";
import { BanEntity } from "../entity/ban.entity";
import { InjectBot } from "nestjs-telegraf";
import { ClankerBotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { UserService } from "@core/service/user.service";

@Injectable()
export class ModerationService {
  private readonly logger = new Logger("Moderation/ModeraitonService");

  /**
   * Base duration for a ban in hours. Each subsequent ban increases
   * 9/27/81/243/729
   * @private
   */
  private static BASE_BAN_DURATION_HOURS = 3;
  private static WARN_LIMIT = 3;

  constructor(
    @InjectBot(ClankerBotName) private readonly bot: Telegraf<Context>,
    private readonly userService: UserService,
    @InjectModel(WarnEntity.name)
    private readonly warnEntityModel: Model<WarnEntity>,
    @InjectModel(BanEntity.name)
    private readonly banEntityModel: Model<BanEntity>
  ) {}

  /*bot.telegram.sendSticker(
    chatId,
    "CAACAgIAAxkBAAMtaMCj9huqEnlcLNC0Q-AlpGt9XwIAAj5tAALGK4BLkonz2kRJC4c2BA"
  );*/
  public async warnUser(
    chatId: number,
    userId: number,
    reason?: string
  ): Promise<WarnResult> {
    const warning = await this.warnEntityModel
      .findOneAndUpdate(
        { chatId: chatId, userId: userId },
        {
          $inc: {
            count: 1,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      )
      .exec();

    if (warning.count >= ModerationService.WARN_LIMIT) {
      const result = await this.banUser(
        chatId,
        userId,
        false,
        reason ?? "Reached warning limit"
      );

      if (result === BanResult.NONE) {
        return WarnResult.NONE;
      }

      if (result === BanResult.PERMA_BANNED) {
        return WarnResult.PERMA_BANNED;
      }

      return WarnResult.BANNED;
    }

    return WarnResult.WARNED;
  }

  public async banUser(
    chatId: number,
    userId: number,
    revoke = false,
    reason?: string
  ): Promise<BanResult> {
    const banEntity = await this.banEntityModel
      .findOneAndUpdate(
        { chatId: chatId, userId: userId },
        {
          $inc: {
            severity: 1,
          },
          reason: reason,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      )
      .exec();

    const banTime = this.calculateBanDuration(banEntity);

    await this.bot.telegram.banChatMember(chatId, userId, banTime, {
      revoke_messages: revoke,
    });

    if (banTime > 0) {
      return BanResult.BANNED;
    } else {
      return BanResult.PERMA_BANNED;
    }
  }

  public async permaBanUser(chatId: number, userId: number, revoke = false) {
    await this.bot.telegram.banChatMember(chatId, userId, 0, {
      revoke_messages: revoke,
    });
  }

  public async unbanUser(chatId: number, userId: number) {
    await this.bot.telegram.unbanChatMember(chatId, userId, {
      only_if_banned: true,
    });
  }

  private calculateBanDuration(banEntity: BanEntity): number {
    if (banEntity.severity >= 7) {
      return 0;
    }

    const hours = Math.pow(
      ModerationService.BASE_BAN_DURATION_HOURS,
      banEntity.severity + 1
    );

    const endDate = new Date();
    endDate.setHours(endDate.getHours() + hours);
    return endDate.getTime();
  }
}

export enum WarnResult {
  NONE = "NONE",
  WARNED = "WARNED",
  BANNED = "BANNED",
  PERMA_BANNED = "PERMA_BANNED",
}

export enum BanResult {
  NONE = "NONE",
  BANNED = "BANNED",
  PERMA_BANNED = "PERMA_BANNED",
}
