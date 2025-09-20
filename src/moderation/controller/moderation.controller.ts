import { Logger, UseGuards } from "@nestjs/common";
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
import { ClankerBotName } from "@/app.constants";
import { AdminGuard } from "@core/guard/admin.guard";
import { TranslationService } from "../service/translation.service";
import {
  LanguageCheckService,
  LanguageWarnResult,
} from "@moderation/service/language-check.service";
import { ProfanityCheckService } from "../service/profanity-check.service";
import { CharacterService } from "@character/service/character.service";
import { MessageService } from "@core/service/message.service";
import { ConfigService } from "@core/service/config.service";
import { FormatterService } from "@core/service/formatter.service";
import { CommandsService } from "@core/service/commands.service";

@Update()
export class ModerationController {
  private readonly logger = new Logger("Moderation/ModerationController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly commandsService: CommandsService,
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
    private readonly translationService: TranslationService,
    private readonly languageCheckService: LanguageCheckService,
    private readonly profanityCheckService: ProfanityCheckService,
    private readonly messageService: MessageService,
    private readonly characterService: CharacterService,
    private readonly formatterService: FormatterService
  ) {
    Promise.all([
      this.commandsService.extendCommands(
        "all_chat_administrators",
        [
          { command: "warn", description: "Warn a user" },
          { command: "ban", description: "Ban a user" },
          { command: "unban", description: "Unban a user" },
          { command: "permaban", description: "Permanently ban a user" },
        ],
        "Moderation"
      ),
      this.commandsService.extendCommands(
        "all_group_chats",
        [
          { command: "warns", description: "Check your warnings" },
          { command: "bans", description: "Check your bans" },
        ],
        "Moderation"
      ),
    ]);
  }

  @Command("warn")
  @UseGuards(AdminGuard)
  async warn(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /warn command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to warn.");
      return;
    }

    const result = await this.moderationService.warnUser(
      message.chat.id,
      message.from.id
    );

    if (result === WarnResult.WARNED) {
      await this.reply(context, message, "User has been warned.");
    } else if (result === WarnResult.BANNED) {
      await this.reply(
        context,
        message,
        "User has been banned due to reaching the warning limit."
      );
    } else {
      await this.reply(context, message, "Failed to issue a warning.");
    }
  }

  @Command("clear")
  @UseGuards(AdminGuard)
  async clear(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /clear command");
  }

  @Command("ban")
  @UseGuards(AdminGuard)
  async ban(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /ban command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to ban.");
      return;
    }

    const result = await this.moderationService.banUser(
      message.chat.id,
      message.from.id
    );

    if (result === BanResult.BANNED) {
      this.reply(context, message, "User has been banned.");
    } else if (result === BanResult.PERMA_BANNED) {
      this.reply(context, message, "User has been banned forever.");
    } else {
      this.reply(context, message, "Failed to ban user.");
    }
  }

  @Command("unban")
  @UseGuards(AdminGuard)
  async unban(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /unban command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to unban.");
      return;
    }

    await this.moderationService
      .unbanUser(message.chat.id, message.from.id)
      .then(() => {
        this.reply(context, message, "User has been unbanned.");
      })
      .catch(() => {
        this.reply(context, message, "Failed to unban user.");
      });
  }

  @Command("permaban")
  @UseGuards(AdminGuard)
  async permaban(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    await this.moderationService.permaBanUser(
      message.message_id,
      context.from.id
    );
  }

  @On(["message", "edited_message"])
  async messageLanguageCheck(
    @Ctx()
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    @Message()
    message:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"],
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.log("Handling message for language check");

    if (!context.text || context.from.is_bot) {
      return next();
    }

    let isChannelComment = false;

    if (message && "reply_to_message" in message) {
      isChannelComment = message.reply_to_message.from.id === 777000;
    }

    if (
      this.languageCheckService.containsNonLanguageSymbols(context.text, ["en"])
    ) {
      this.translationService
        .translateText(context.text)
        .then((translatedText) => {
          if (translatedText) {
            context.sendMessage(translatedText, {
              reply_parameters: {
                message_id: message.message_id,
                chat_id: context.chat.id,
                allow_sending_without_reply: false,
              },
            });
          }
        });

      if (
        !isChannelComment ||
        !this.languageCheckService.containsNonLanguageSymbols(context.text, [
          "en",
          "ru",
          "pt",
        ])
      ) {
        const warnResult = await this.languageCheckService.warnUserForLanguage(
          context.chat.id,
          context.from.id
        );

        void context.react("👀");
        this.logger.log(`Language warning result: ${warnResult}`);

        if (warnResult === LanguageWarnResult.FIRST_WARNED) {
          await this.reply(
            context,
            message,
            `Please use English only. This is your first warning. Further violations may lead to a ban.`
          );
        } else if (warnResult === LanguageWarnResult.WARNED) {
          await this.reply(
            context,
            message,
            `You have been warned for using a non-English language. Please use English only.`
          );
        } else if (warnResult === LanguageWarnResult.BANNED) {
          await this.reply(
            context,
            message,
            `You have been banned for repeated use of non-English language.`
          );
        } else if (warnResult === LanguageWarnResult.PERMA_BANNED) {
          //@todo: better message
          await this.reply(
            context,
            message,
            `You have been permanently banned for whatever you did before and repeated use of non-English language.`
          );
        }
      }
    }

    return next();
  }

  @On(["message", "edited_message"])
  async messageProfanityAndLinksCheck(
    @Ctx()
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    @Message()
    message:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"],
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.log("Handling message for profanity and links check");

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
        "For not learning which words not to use"
      );

      if (result === WarnResult.WARNED) {
        await this.reply(
          context,
          message,
          "User has been warned for using profanity."
        );
      } else if (result === WarnResult.BANNED) {
        await this.reply(
          context,
          message,
          "User has been banned due using profanity after reaching the warning limit."
        );
      } else {
        await this.reply(context, message, "Failed to issue a warning.");
      }
    }

    return next();
  }

  @Command("warns")
  async warns(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /warns command");

    const warn = await this.moderationService.getWarns(
      message.chat.id,
      context.from.id
    );

    if (warn !== null) {
      await this.reply(context, message, `You have ${warn.count} warning(s).`);
    } else {
      await this.reply(context, message, "You have no warnings.");
    }
  }

  @Command("bans")
  async bans(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /warns command");

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
      );
    } else {
      this.reply(context, message, "You have no bans.");
    }
  }

  @On("message_reaction")
  async handleMessageReaction(
    @Ctx() context: Context<TelegramUpdate.MessageReactionUpdate>
  ): Promise<void> {
    this.logger.log("Handling message reaction");

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
      answer = await this.characterService.rephrase(context.chat.id, answer);
    }

    return context.sendMessage(this.formatterService.escapeMarkdownV2(answer), {
      parse_mode: "Markdown",
      reply_parameters: {
        chat_id: context.chat.id,
        message_id: message.message_id,
        allow_sending_without_reply: true,
      },
    });
  }
}
