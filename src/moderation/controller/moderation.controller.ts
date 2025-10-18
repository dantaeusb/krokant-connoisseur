import { forwardRef, Inject, Logger, UseGuards } from "@nestjs/common";
import {
  Command,
  Ctx,
  InjectBot,
  Message,
  Next,
  On,
  Update,
} from "nestjs-telegraf";
import { Update as TelegramUpdate } from "telegraf/types";
import {
  BanResult,
  ModerationService,
  WarnResult,
} from "../service/moderation.service";
import { Context, Telegraf } from "telegraf";
import { BotName } from "@/app.constants";
import { AdminGuard } from "@core/guard/admin.guard";
import { ProfanityCheckService } from "../service/profanity-check.service";
import { CharacterService } from "@roleplay/service/character.service";
import { MessageService } from "@core/service/message.service";
import { ConfigService } from "@core/service/config.service";
import { FormatterService } from "@core/service/formatter.service";
import { CommandsService } from "@core/service/commands.service";
import { UserService } from "@core/service/user.service";
import { TranslationService } from "../service/translation.service";
import {
  LanguageCheckService,
  LanguageWarnResult,
} from "@moderation/service/language-check.service";

@Update()
export class ModerationController {
  private static readonly MIN_SELF_MUTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_SELF_MUTE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 day

  private readonly logger = new Logger("Moderation/ModerationController");

  constructor(
    private readonly commandsService: CommandsService,
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
    private readonly translationService: TranslationService,
    private readonly languageCheckService: LanguageCheckService,
    private readonly profanityCheckService: ProfanityCheckService,
    private readonly userService: UserService,
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => CharacterService))
    private readonly characterService: CharacterService
  ) {
    Promise.all([
      this.commandsService.extendCommands(
        "all_chat_administrators",
        [
          {
            forModule: "Moderation",
            command: "warn",
            description: "Warn a user",
          },
          {
            forModule: "Moderation",
            command: "mute",
            description: "Mute a user",
          },
          {
            forModule: "Moderation",
            command: "unmute",
            description: "Unmute a user",
          },
          {
            forModule: "Moderation",
            command: "permaban",
            description: "Permanently ban a user",
          },
        ],
        "Moderation"
      ),
      this.commandsService.extendCommands(
        "all_group_chats",
        [
          {
            forModule: "Moderation",
            command: "warns",
            description: "Check your warnings",
            detailedDescription: "Allows users to show many warnings they have",
          },
          {
            forModule: "Moderation",
            command: "bans",
            description: "Check your bans",
            detailedDescription: "Allows users to show their last ban severity",
          },
        ],
        "Moderation"
      ),
    ]);
  }

  @Command("warn")
  @UseGuards(AdminGuard)
  async warnCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /warn command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to warn.");
      void context.react("🤷‍♂");
      return;
    }

    const commandArguments = this.commandsService.getCommandMessageArguments(
      context.text
    );
    const reason = commandArguments.join(" ") || "No reason provided";

    const result = await this.moderationService.warnUser(
      message.chat.id,
      targetUserId,
      undefined,
      reason
    );

    const user = await this.userService.getUser(
      context.chat.id,
      targetUserId,
      context.from
    );

    const name = user?.name || "User";

    if (result === WarnResult.WARNED) {
      void context.react("👌");
      await this.reply(context, message, `${name} has been warned.`);
    } else if (result === WarnResult.MUTED) {
      void context.react("👌");
      await this.reply(
        context,
        message,
        `${name} has been banned due to reaching the warning limit.`
      );
    } else {
      await this.reply(
        context,
        message,
        `Failed to issue a warning for ${name}.`
      );
    }
  }

  @Command("clear")
  @UseGuards(AdminGuard)
  async clearCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /clear command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to warn.");
      void context.react("🤷‍♂");
      return;
    }

    const result = await this.moderationService.resetWarns(
      message.chat.id,
      targetUserId
    );

    if (result) {
      void context.react("👌");
      await this.reply(context, message, "User warnings have been cleared.");
    } else {
      void context.react("🤷‍♂");
      await this.reply(context, message, "Failed to clear user warnings.");
    }
  }

  @Command("ban")
  @Command("mute")
  @UseGuards(AdminGuard)
  async banCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /ban or /mute command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to ban.");
      void context.react("🤷‍♂");
      return;
    }

    const commandArguments = this.commandsService.getCommandMessageArguments(
      context.text
    );

    const revoke =
      this.commandsService.extractCommandExactStringMut(commandArguments, [
        "ban",
        "mute",
      ]) === "ban";
    const severity =
      this.commandsService.extractCommandIntegerMut(commandArguments);
    const duration =
      this.commandsService.extractCommandDurationMut(commandArguments);
    const reason = commandArguments.join(" ") || "No reason provided";

    const result = await this.moderationService.banUser(
      message.chat.id,
      targetUserId,
      revoke,
      reason,
      undefined,
      severity,
      duration
    );

    const targetUser = await this.userService.getUser(
      context.chat.id,
      targetUserId,
      context.from
    );

    const name = targetUser?.name || "User";

    if (result === BanResult.MUTED) {
      context.react("👌").catch((error) => {
        this.logger.error("Failed to react to message:", error);
      });
      await this.reply(context, message, `${name} has been muted.`);
    } else if (result === BanResult.PERMA_BANNED) {
      context.react("👌").catch((error) => {
        this.logger.error("Failed to react to message:", error);
      });
      await this.reply(context, message, `${name} has been banned forever.`);
    } else {
      context.react("🤷‍♂").catch((error) => {
        this.logger.error("Failed to react to message:", error);
      });
      await this.reply(context, message, `Failed to mute ${name}.`);
    }
  }

  @Command("unban")
  @Command("unmute")
  @UseGuards(AdminGuard)
  async unbanCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /unban command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to unban.");
      void context.react("🤷‍♂").catch((error) => {
        this.logger.error("Failed to react to message:", error);
      });
      return;
    }

    try {
      await this.moderationService.unbanUser(message.chat.id, targetUserId);
    } catch (error) {
      this.logger.error("Error unbanning user:", error);
      void context.react("🤷‍♂").catch((error) => {
        this.logger.error("Failed to react to message:", error);
      });
      return;
    }

    const targetUser = await this.userService.getUser(
      context.chat.id,
      targetUserId,
      context.from
    );

    const name = this.userService.getSafeUserName(targetUser);

    await this.reply(context, message, `${name} has been unbanned.`);
  }

  /**
   * @todo: [HIGH] Register event (db) and notify user
   * @param context
   * @param message
   */
  @Command("permaban")
  @UseGuards(AdminGuard)
  async permabanCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /unban command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to permaban.");
      context.react("🤷‍♂").catch((error) => {
        this.logger.error("Failed to react to message:", error);
      });
      return;
    }

    await this.moderationService.permaBanUser(context.chat.id, targetUserId);
    context.react("👌").catch((error) => {
      this.logger.error("Failed to react to message:", error);
    });

    await this.reply(context, message, `User has been permabanned.`);
  }

  /**
   * Do not question its name.
   * @param context
   * @param message
   */
  @Command("penis")
  @Command("muteme")
  async selfMuteCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /muteme command");

    const commandArguments = this.commandsService.getCommandMessageArguments(
      context.text
    );

    let duration = 60 * 60 * 1000; // Default to 1 hour

    if (commandArguments.length !== 0) {
      if (commandArguments[0].match(/^\d+$/) !== null) {
        duration = parseInt(commandArguments[0]) * 60 * 1000;
      } else {
        const possibleDuration =
          this.commandsService.extractCommandDurationMut(commandArguments);

        if (possibleDuration !== null) {
          duration = possibleDuration;
        }
      }
    }

    duration = Math.max(
      Math.min(duration, ModerationController.MAX_SELF_MUTE_DURATION_MS),
      ModerationController.MIN_SELF_MUTE_DURATION_MS
    );

    await this.moderationService.banUser(
      context.chat.id,
      context.from.id,
      false,
      "User requested self-mute",
      1,
      undefined,
      duration
    );

    context.react("👌").catch((error) => {
      this.logger.error("Failed to react to message:", error);
    });

    const targetUser = await this.userService.getUser(
      context.chat.id,
      context.from.id,
      context.from
    );

    const name = this.userService.getSafeUserName(targetUser);

    // @todo: [MED] Add duration to message
    await this.reply(context, message, `${name} decided to mute themselves.`);
  }

  /**
   * @todo: [HIGH] Something is wrong with edited_message update type, there's no message property in context
   * @param context
   * @param message
   * @param next
   */
  @On(["message", "edited_message"])
  async messageLanguageCheck(
    @Ctx()
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    @Next() next: () => Promise<void>
  ): Promise<void> {
    try {
      this.logger.debug("Handling message for language check");

      const message:
        | TelegramUpdate.MessageUpdate["message"]
        | TelegramUpdate.EditedMessageUpdate["edited_message"] =
        "message" in context.update
          ? context.update.message
          : context.update.edited_message;

      const isEdited = "edited_message" in context.update;

      if (!context.text || context.from.is_bot) {
        return next();
      }

      let isChannelComment = false;

      if (message && "reply_to_message" in message) {
        isChannelComment = message.reply_to_message.from.id === 777000;
      }

      if (
        this.languageCheckService.containsNonLanguageSymbols(context.text, [
          "en",
        ])
      ) {
        if (!isEdited) {
          this.translationService
            .translateText(context.text)
            .then((translatedText) => {
              if (translatedText) {
                this.messageService
                  .sendMessage(context.chat.id, translatedText, {
                    reply_parameters: {
                      message_id: message.message_id,
                      chat_id: context.chat.id,
                      allow_sending_without_reply: false,
                    },
                  })
                  .catch((error) => {
                    this.logger.error(
                      "Failed to send translated message",
                      error
                    );
                  });
              }
            })
            .catch((error) => {
              this.logger.error("Failed to translate message", error);
            });
        }

        if (
          !isChannelComment ||
          !this.languageCheckService.containsNonLanguageSymbols(context.text, [
            "en",
            "ru",
            "pt",
          ])
        ) {
          const warnResult =
            await this.languageCheckService.warnUserForLanguage(
              context.chat.id,
              context.from.id
            );

          void context.react("👀").catch(() => {
            this.logger.warn("Failed to react to translated message");
          });

          this.logger.debug(`Language warning result: ${warnResult}`);

          const user = await this.userService.getUser(
            context.chat.id,
            context.from.id,
            context.from
          );

          const name = user?.name || "User";

          if (warnResult === LanguageWarnResult.FIRST_WARNED) {
            await this.reply(
              context,
              message,
              `Please use English only, ${name}. This is your first warning. Further violations may lead to a ban.`
            );
          } else if (warnResult === LanguageWarnResult.WARNED) {
            await this.reply(
              context,
              message,
              `${name} you have been warned for using a non-English language. Please use English only.`
            );
          } else if (warnResult === LanguageWarnResult.LAST_SOFT_WARNED) {
            await this.reply(
              context,
              message,
              `${name} this is your last warning for using a non-English language. Further violations will lead to a mute. Please use English only.`
            );
          } else if (warnResult === LanguageWarnResult.MUTED) {
            await this.reply(
              context,
              message,
              `${name} you have been banned for repeated use of non-English language.`
            );
          } else if (warnResult === LanguageWarnResult.PERMA_BANNED) {
            //@todo: better message
            await this.reply(
              context,
              message,
              `${name} you have been permanently banned for whatever you did before and repeated use of non-English language.`
            );
          }
        }
      }
    } catch (error) {
      this.logger.error("Error in messageLanguageCheck:", error);
    }

    return next();
  }

  @On(["message", "edited_message"])
  async messageProfanityAndLinksCheck(
    @Ctx()
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.debug("Handling message for profanity and links check");

    const message:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"] =
      "message" in context.update
        ? context.update.message
        : context.update.edited_message;

    if (!context.text) {
      return next();
    }

    const hasProfanity = await this.profanityCheckService.containsProfanity(
      context.chat.id,
      context.text
    );

    if (hasProfanity) {
      // @todo: [HIGH] Warn moderator if not deleted?
      void context.deleteMessage(context.message.message_id);

      const result = await this.moderationService.warnUser(
        context.chat.id,
        context.from.id,
        undefined,
        "For not learning which words not to use"
      );

      const user = await this.userService.getUser(
        context.chat.id,
        context.from.id,
        context.from
      );

      const name = user?.name || "User";

      if (result === WarnResult.WARNED) {
        await this.reply(
          context,
          message,
          `${name} has been warned for using profanity.`
        ).catch((error) => {
          this.logger.error(
            "Failed to send acknowledge for warn on profanity:",
            error
          );
        });
      } else if (result === WarnResult.MUTED) {
        await this.reply(
          context,
          message,
          `${name} has been banned due using profanity after reaching the warning limit.`
        ).catch((error) => {
          this.logger.error(
            "Failed to send acknowledge for ban on profanity:",
            error
          );
        });
      } else {
        await this.reply(context, message, "Failed to issue a warning.").catch(
          (error) => {
            this.logger.error(
              "Failed to send acknowledge for ban on profanity:",
              error
            );
          }
        );
      }
    }

    return next();
  }

  @Command("warns")
  async warnsCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /warns command");

    const warn = await this.moderationService.getWarns(
      message.chat.id,
      context.from.id
    );

    if (warn !== null) {
      await this.reply(
        context,
        message,
        `You have ${warn.count} of ${ModerationService.WARN_LIMIT} warning(s).`
      ).catch((error) => {
        this.logger.error("Failed to send warns reply:", error);
      });
    } else {
      await this.reply(context, message, "You have no warnings.").catch(
        (error) => {
          this.logger.error("Failed to send warns reply:", error);
        }
      );
    }
  }

  @Command("bans")
  async bansCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /warns command");

    const ban = await this.moderationService.getBans(
      message.chat.id,
      context.from.id
    );

    const duration = this.moderationService.getBanDuration(ban?.severity || 0);

    if (ban !== null) {
      this.reply(
        context,
        message,
        `Your last ban had severity of ${ban.severity}, which is ${duration}.`
      ).catch((error) => {
        this.logger.error("Failed to send bans reply:", error);
      });
    } else {
      this.reply(context, message, "You have no bans.").catch((error) => {
        this.logger.error("Failed to send bans reply:", error);
      });
    }
  }

  @On("message_reaction")
  async messageReactionHandle(
    @Ctx() context: Context<TelegramUpdate.MessageReactionUpdate>
  ): Promise<void> {
    this.logger.debug("Handling message reaction");

    if (context && context.messageReaction) {
      this.logger.log(
        `User ${
          context.from.id
        } reacted with ${context.messageReaction.new_reaction.map((r) => {
          if (r.type === "emoji") {
            return r.emoji;
          } else if (r.type === "custom_emoji") {
            return r.custom_emoji_id;
          }
        })} on message ${context.messageReaction.message_id}`
      );
    }
  }

  private async reply(
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    message:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"],
    answer: string
  ) {
    const config = await this.configService.getConfig(context.chat.id);
    const rephrase = config ? !!config.yapping : false;

    if (rephrase) {
      const toUser = await this.userService.getUser(
        context.chat.id,
        message.from.id,
        context.from
      );

      answer = await this.characterService.rephrase(
        context.chat.id,
        answer,
        toUser
      );
    }

    return this.messageService.sendMessage(context.chat.id, answer, {
      reply_parameters: {
        chat_id: context.chat.id,
        message_id: message.message_id,
        allow_sending_without_reply: true,
      },
    });
  }
}
