import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { WarnEntity } from "../entity/warn.entity";
import { BanEntity } from "../entity/ban.entity";
import { InjectBot } from "nestjs-telegraf";
import { ClankerBotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { UserService } from "@core/service/user.service";
import { Cron } from "@nestjs/schedule";

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

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
    @InjectModel(WarnEntity.COLLECTION_NAME)
    private readonly warnEntityModel: Model<WarnEntity>,
    @InjectModel(BanEntity.COLLECTION_NAME)
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

  public async muteUser(chatId: number, userId: number): Promise<boolean> {
    try {
      await this.bot.telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        },
        // until_date: banTime > 0 ? Math.floor(banTime / 1000) : undefined,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to mute user ${userId} in chat ${chatId}`,
        error
      );
      return false;
    }
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

    const banEndTime = this.calculateBanEndTime(banEntity);

    try {
      if (banEndTime > 0) {
        if (revoke) {
          await this.bot.telegram.banChatMember(chatId, userId, banEndTime, {
            revoke_messages: true,
          });
        } else {
          await this.bot.telegram.restrictChatMember(chatId, userId, {
            permissions: {
              can_send_messages: false,
              can_send_polls: false,
              can_send_other_messages: false,
              can_add_web_page_previews: false,
              can_change_info: false,
              can_invite_users: false,
              can_pin_messages: false,
            },
            until_date: banEndTime,
          });
        }
      } else {
        await this.bot.telegram.banChatMember(chatId, userId, 0, {
          revoke_messages: revoke,
        });
        return BanResult.PERMA_BANNED;
      }
    } catch (error) {
      this.logger.error(
        `Failed to ban user ${userId} in chat ${chatId}`,
        error
      );
      return BanResult.NONE;
    }

    if (banEndTime > 0) {
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

  public async unbanUser(chatId: number, userId: number): Promise<boolean> {
    return this.bot.telegram.unbanChatMember(chatId, userId, {
      only_if_banned: true,
    });
  }

  public async getWarns(
    chatId: number,
    userId: number
  ): Promise<WarnEntity | null> {
    return this.warnEntityModel
      .findOne({ chatId: chatId, userId: userId })
      .exec();
  }

  public async getBans(
    chatId: number,
    userId: number
  ): Promise<BanEntity | null> {
    return this.banEntityModel
      .findOne({ chatId: chatId, userId: userId })
      .exec();
  }

  private calculateBanEndTime(banEntity: BanEntity): number {
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

  public getBanDuration(severity: number): string {
    if (severity >= 7) {
      return "Permanent";
    }

    const hours = Math.pow(
      ModerationService.BASE_BAN_DURATION_HOURS,
      severity + 1
    );

    if (hours < 24) {
      return `${hours} hour(s)`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (remainingHours === 0) {
      return `${days} day(s)`;
    }

    return `${days} day(s) and ${remainingHours} hour(s)`;
  }

  @Cron("0 * * * *")
  public async cooldownWarnings() {
    this.logger.log("Running warn cooldown job");

    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - 1);

    // @todo: Only not banned users

    const result = await this.warnEntityModel.updateMany(
      { updatedAt: { $lt: cooldownDate }, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    );

    this.logger.log(`Cooled down ${result.modifiedCount} warnings`);
  }

  @Cron("0 0 * * *")
  public async cooldownBans() {
    this.logger.log("Running ban cooldown job");

    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - 7);

    const result = await this.banEntityModel.updateMany(
      {
        updatedAt: { $lt: cooldownDate },
        severity: { $gt: 0 },
        // Not currently banned and not perma-banned
        expiresAt: { $lt: new Date(), $ne: [null, 0] },
      },
      { $inc: { severity: -1 } }
    );

    this.logger.log(`Cooled down ${result.modifiedCount} bans`);
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
