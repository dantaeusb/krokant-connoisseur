import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { WarnEntity } from "../entity/warn.entity";
import { BanEntity } from "../entity/ban.entity";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { Cron } from "@nestjs/schedule";
import { BanEventEntity } from "@moderation/entity/ban/event.entity";

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  /**
   * Base duration for a ban in hours. Each subsequent ban increases
   * 9/27/81/243/729
   * @private
   */
  public static WARN_LIMIT = 3;
  private static BASE_BAN_DURATION_HOURS = 3;

  constructor(
    @InjectBot(BotName) private readonly bot: Telegraf<Context>,
    @InjectModel(WarnEntity.COLLECTION_NAME)
    private readonly warnEntityModel: Model<WarnEntity>,
    @InjectModel(BanEntity.COLLECTION_NAME)
    private readonly banEntityModel: Model<BanEntity>
  ) {}

  /**
   *
   * Warn section
   *
   */

  /**
   *
   * @param chatId ID of the chat to ban the user in
   * @param userId ID of the user to ban
   * @param limitedSeverity do not increase severity beyond this value
   * @param reason reason for the warn
   */
  public async warnUser(
    chatId: number,
    userId: number,
    limitedSeverity?: number,
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
        reason ?? "Reached warning limit",
        limitedSeverity,
        undefined
      );

      if (result === BanResult.NONE) {
        return WarnResult.NONE;
      }

      if (result === BanResult.PERMA_BANNED) {
        return WarnResult.PERMA_BANNED;
      }

      return WarnResult.MUTED;
    }

    return WarnResult.WARNED;
  }

  public async resetWarns(chatId: number, userId: number): Promise<boolean> {
    const result = await this.warnEntityModel
      .findOneAndUpdate(
        { chatId: chatId, userId: userId },
        {
          count: 0,
        }
      )
      .exec();

    return result !== null;
  }

  public async getWarns(
    chatId: number,
    userId: number
  ): Promise<WarnEntity | null> {
    return this.warnEntityModel
      .findOne({ chatId: chatId, userId: userId })
      .exec();
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

  /**
   * Mute/ban section
   */

  /**
   * Bans and mutes use the same entries, bans happen only if messages are revoked
   * or if severity is high enough. In case of a ban, all warnings are reset.
   *
   * @param chatId ID of the chat to ban the user in
   * @param userId ID of the user to ban
   * @param revoke if true, all messages will be deleted
   * @param reason reason for the mute
   * @param limitedSeverity do not increase severity beyond this value
   * @param forceSeverity force set severity to this value
   * @param forceDuration force set duration to this value (in milliseconds)
   */
  public async banUser(
    chatId: number,
    userId: number,
    revoke = false,
    reason?: string,
    limitedSeverity?: number,
    forceSeverity?: number,
    forceDuration?: number
  ): Promise<BanResult> {
    const banEntity = await this.banEntityModel
      .findOneAndUpdate(
        { chatId: chatId, userId: userId },
        {},
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      )
      .exec();

    const action = revoke ? "ban" : "mute";

    if (forceSeverity) {
      banEntity.severity = forceSeverity;
    } else if (limitedSeverity) {
      banEntity.severity = Math.min(banEntity.severity + 1, limitedSeverity);
    } else {
      banEntity.severity += 1;
    }

    const banEndTime = forceDuration
      ? Math.floor((new Date().getTime() + forceDuration) / 1000)
      : this.calculateBanEndTime(banEntity);

    this.logger.log(
      `With severity ${
        banEntity.severity
      }, banning user ${userId} in chat ${chatId} until ${
        banEndTime > 0
          ? new Date(banEndTime * 1000).toISOString()
          : "end of time"
      }${reason ? ` for reason: ${reason}` : ""} via ${action}ing`
    );

    try {
      if (banEndTime > 0) {
        if (action === "ban") {
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
              can_invite_users: false,
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

    banEntity.expiresAt = banEndTime > 0 ? new Date(banEndTime * 1000) : null;
    banEntity.events.push({
      type: revoke ? "ban" : "mute",
      reason: reason,
      severity: banEntity.severity,
      expiresAt: banEndTime > 0 ? new Date(banEndTime * 1000) : null,
    } as BanEventEntity);

    await banEntity.save();
    await this.resetWarns(chatId, userId);

    if (banEndTime > 0) {
      if (revoke) {
        return BanResult.BANNED;
      }

      return BanResult.MUTED;
    } else {
      return BanResult.PERMA_BANNED;
    }
  }

  public async permaBanUser(chatId: number, userId: number, revoke = false) {
    await this.bot.telegram.banChatMember(chatId, userId, 0, {
      revoke_messages: revoke,
    });
  }

  public async pardonUser(chatId: number, userId: number): Promise<boolean> {
    const result = this.unbanUser(chatId, userId);

    return this.banEntityModel.findOneAndUpdate(
      { chatId: chatId, userId: userId },
      {
        expiresAt: null,
        severity: {
          $min: 0,
          $inc: -1,
        },
        $push: {
          events: {
            type: "ban",
            reason: "Pardoned",
            severity: 0,
            expiresAt: null,
          } as BanEventEntity,
        },
      }
    );
  }

  public async unbanUser(chatId: number, userId: number): Promise<void> {
    Promise.all([
      this.bot.telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_invite_users: true,
        },
      }),
      this.bot.telegram.unbanChatMember(chatId, userId, {
        only_if_banned: true,
      }),
    ]);
  }

  public async getBans(
    chatId: number,
    userId: number
  ): Promise<BanEntity | null> {
    return this.banEntityModel
      .findOne({ chatId: chatId, userId: userId })
      .exec();
  }

  /**
   * @todo: This needs rework, we need to get time offset from the same
   * method, but then convert it to unix seconds or readable date or whatever
   */

  /**
   * @param banEntity
   * @private
   */
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
    return endDate.getTime() / 1000;
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
  MUTED = "MUTED",
  PERMA_BANNED = "PERMA_BANNED",
}

export enum BanResult {
  NONE = "NONE",
  MUTED = "MUTED",
  BANNED = "BANNED",
  PERMA_BANNED = "PERMA_BANNED",
}
