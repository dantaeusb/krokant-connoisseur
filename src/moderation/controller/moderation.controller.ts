import { Logger, UseGuards } from "@nestjs/common";
import {
  Command,
  Ctx,
  InjectBot,
  Message,
  On,
  Sender,
  Update,
  Next,
} from "nestjs-telegraf";
import { ModerationService, WarnResult } from "../service/moderation.service";
import { Context, Telegraf } from "telegraf";
import { ClankerBotName } from "@/app.constants";
import { AdminGuard } from "@core/guard/admin.guard";
import { TranslationService } from "@moderation/service/translation.service";
import {
  LanguageCheckService,
  LanguageWarnResult,
} from "@moderation/service/language-check.service";
import { Update as TelegramUpdate } from "telegraf/types";
import { CharacterService } from "@character/service/character.service";
import { MessageService } from "@core/service/message.service";
import { ConfigService } from "@core/service/config.service";

@Update()
export class ModerationController {
  private readonly logger = new Logger("Moderation/ModerationController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
    private readonly translationService: TranslationService,
    private readonly languageCheckService: LanguageCheckService,
    private readonly messageService: MessageService,
    private readonly characterService: CharacterService
  ) {}

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
      this.reply(context, message, "User has been warned.");
    } else if (result === WarnResult.BANNED) {
      this.reply(
        context,
        message,
        "User has been banned due to reaching the warning limit."
      );
    } else {
      this.reply(context, message, "Failed to issue a warning.");
    }
  }

  @Command("clear")
  @UseGuards(AdminGuard)
  async clear(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    context.reply("Processing clear...");
  }

  @Command("ban")
  @UseGuards(AdminGuard)
  async ban(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /ban command");

    await this.moderationService.banUser(message.message_id, context.from.id);
  }

  @Command("unban")
  @UseGuards(AdminGuard)
  async unban(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /unban command");

    await this.moderationService.unbanUser(message.message_id, context.from.id);
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

    if (!isChannelComment) {
      if (
        this.languageCheckService.containsNonLanguageSymbols(context.text, [
          "en",
        ])
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

        const warnResult = await this.languageCheckService.warnUserForLanguage(
          context.chat.id,
          context.from.id
        );

        if (warnResult !== LanguageWarnResult.NONE) {
          void context.react("👀");
        }

        if (warnResult === LanguageWarnResult.FIRST_WARNED) {
          this.reply(
            context,
            message,
            `Please use English only. This is your first warning. Further violations may lead to a ban.`
          );
        } else if (warnResult === LanguageWarnResult.WARNED) {
          this.reply(
            context,
            message,
            `You have been warned for using a non-English language. Please use English only.`
          );
        } else if (warnResult === LanguageWarnResult.BANNED) {
          this.reply(
            context,
            message,
            `You have been banned for repeated use of non-English language.`
          );
        }
      }
    } else {
      if (
        this.languageCheckService.containsNonLanguageSymbols(context.text, [
          "en",
        ])
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

        const warnResult = await this.languageCheckService.warnUserForLanguage(
          context.chat.id,
          context.from.id
        );

        if (warnResult !== LanguageWarnResult.NONE) {
          context.react("👀");
        }

        if (warnResult === LanguageWarnResult.FIRST_WARNED) {
          this.reply(
            context,
            message,
            `Please use English only. This is your first warning. Further violations may lead to a ban.`
          );
        } else if (warnResult === LanguageWarnResult.WARNED) {
          this.reply(
            context,
            message,
            `You have been warned for using a non-English language. Please use English only.`
          );
        } else if (warnResult === LanguageWarnResult.BANNED) {
          this.reply(
            context,
            message,
            `You have been banned for repeated use of non-English language.`
          );
        }
      }

      if (
        this.languageCheckService.containsNonLanguageSymbols(context.text, [
          "en",
          "ru",
          "pt",
        ])
      ) {
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

    //this.logger.log(message);

    return next();
  }

  private async reply(
    @Ctx()
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    @Message()
    message:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"],
    answer: string
  ) {
    const config = await this.configService.getConfig(context.chat.id);
    const rephrase = config ? !config.yapping : false;

    if (rephrase) {
      answer = await this.characterService.rephrase(answer);
    }

    return context.reply(this.escapeMarkdownV2(answer), {
      parse_mode: "MarkdownV2",
      reply_parameters: {
        chat_id: context.chat.id,
        message_id: message.message_id,
        allow_sending_without_reply: true,
      },
    });
  }

  private escapeMarkdownV2(text: string): string {
    // Escape characters that are reserved in MarkdownV2 but not typically part of markdown formatting.
    // This avoids breaking formatting from Gemini while preventing Telegram API errors.
    return text.replace(/([>#+\-=|{}.!])/g, "\\$1");
  }
}
