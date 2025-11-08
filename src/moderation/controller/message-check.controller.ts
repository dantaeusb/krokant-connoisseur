import { forwardRef, Inject, Logger } from "@nestjs/common";
import { Ctx, Next, On, Update } from "nestjs-telegraf";
import { Update as TelegramUpdate } from "telegraf/types";
import { ModerationService, WarnResult } from "../service/moderation.service";
import { Context } from "telegraf";
import { ProfanityCheckService } from "../service/profanity-check.service";
import { CharacterService } from "@roleplay/service/character.service";
import { MessageService } from "@core/service/message.service";
import { ConfigService } from "@core/service/config.service";
import { UserService } from "@core/service/user.service";
import { TranslationService } from "../service/translation.service";
import {
  ImageCheckResult,
  ImageCheckService,
} from "../service/image-check.service";
import {
  LanguageCheckService,
  LanguageWarnResult,
} from "../service/language-check.service";
import { UserDocument } from "@core/entity/user.entity";
import { ImageDescriptionService } from "@roleplay/service/image-description.service";

@Update()
export class MessageCheckController {
  private readonly logger = new Logger("Moderation/MessageCheckController");

  constructor(
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
    private readonly translationService: TranslationService,
    private readonly languageCheckService: LanguageCheckService,
    private readonly profanityCheckService: ProfanityCheckService,
    private readonly userService: UserService,
    private readonly messageService: MessageService,
    private readonly imageCheckService: ImageCheckService,
    @Inject(forwardRef(() => CharacterService))
    private readonly characterService: CharacterService,
    @Inject(forwardRef(() => ImageDescriptionService))
    private readonly imageDescriptionService: ImageDescriptionService
  ) {}

  /**
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
            .then(async (translatedText) => {
              if (translatedText) {
                const profanities =
                  await this.profanityCheckService.containsProfanities(
                    context.chat.id,
                    translatedText
                  );

                if (profanities && profanities.length > 0) {
                  // @todo: [HIGH] Warn moderator if not deleted?
                  context
                    .deleteMessage(context.message.message_id)
                    .catch((error) => {
                      this.logger.error(
                        "Failed to delete message with profanities:",
                        error
                      );
                    });

                  await this.warn(
                    context,
                    message,
                    `Used profanities: ${profanities.join(", ")}`,
                    `Used profanity in translated message`
                  );

                  return;
                }

                this.messageService
                  .sendMessage(
                    context.chat.id,
                    translatedText,
                    {
                      reply_parameters: {
                        message_id: message.message_id,
                        chat_id: context.chat.id,
                        allow_sending_without_reply: false,
                      },
                    },
                    true,
                    false
                  )
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

    const profanities = await this.profanityCheckService.containsProfanities(
      context.chat.id,
      context.text
    );

    if (profanities && profanities.length > 0) {
      // @todo: [HIGH] Warn moderator if not deleted?
      void context.deleteMessage(context.message.message_id);

      await this.warn(
        context,
        message,
        `Used profanities: ${profanities.join(", ")}`,
        `Used profanity`
      );
    }

    return next();
  }

  /**
   * @param context
   * @param message
   * @param next
   */
  @On(["message", "edited_message"])
  async imageCheck(
    @Ctx()
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    @Next() next: () => Promise<void>
  ): Promise<void> {
    try {
      this.logger.debug("Handling message for image check");

      const config = await this.configService.getConfig(context.chat.id);

      if (!config.yapping) {
        return next();
      }

      if ("photo" in context.message && context.message.photo) {
        const description =
          await this.imageDescriptionService.getImageDescription(
            context.chat.id,
            context.message
          );

        const checkResult = await this.imageCheckService.checkImageFlags(
          context.chat.id,
          context.from.id,
          context.message.message_id,
          context.message,
          description.flags
        );

        if (checkResult !== ImageCheckResult.NONE) {
          const user = await this.userService.getUser(
            context.chat.id,
            context.from.id,
            context.from
          );

          const name = user?.name || "User";

          /**
           * @todo: [HIGH] It's getting shitty, refactor announcement into
           * the warning service itself
           */
          if (checkResult === ImageCheckResult.WARNED) {
            await this.reply(
              context,
              context.message,
              `${name} has been warned for restricted media.`
            ).catch((error) => {
              this.logger.error("Failed to send acknowledge for warn:", error);
            });
          } else if (checkResult === ImageCheckResult.MUTED) {
            await this.reply(
              context,
              context.message,
              `${name} has been banned for restricted media.`
            ).catch((error) => {
              this.logger.error("Failed to send acknowledge for ban:", error);
            });
          } else if (checkResult === ImageCheckResult.PERMA_BANNED) {
            await this.reply(
              context,
              context.message,
              `${name} has been perma banned for restricted media.`
            ).catch((error) => {
              this.logger.error("Failed to send acknowledge for ban:", error);
            });
          }
        }

        const profanities =
          await this.profanityCheckService.containsProfanities(
            context.chat.id,
            description.text
          );

        if (profanities && profanities.length > 0) {
          void context.deleteMessage(context.message.message_id);

          await this.warn(
            context,
            context.message,
            `Used image with profanities: ${profanities.join(", ")}`,
            `Sent an image with profanity`
          );
        }

        const hasNonEnglish =
          this.languageCheckService.containsNonLanguageSymbols(
            description.text,
            ["en"]
          );

        if (hasNonEnglish) {
          void context.react("👀").catch(() => {
            this.logger.warn(
              "Failed to react to non-English image description"
            );
          });

          const explanation = await this.characterService.rephrase(
            context.chat.id,
            context.from.id,
            `Description of the image: ${description.description}`,
            await this.userService.getUser(
              context.chat.id,
              context.from.id,
              context.from
            )
          );

          this.messageService
            .sendMessage(
              context.chat.id,
              explanation,
              {
                reply_parameters: {
                  message_id: context.message.message_id,
                  chat_id: context.chat.id,
                  allow_sending_without_reply: false,
                },
              },
              true,
              false
            )
            .catch((error) => {
              this.logger.error(
                "Failed to send image description message",
                error
              );
            });
        }
      }
    } catch (error) {
      this.logger.error("Error in imageCheck:", error);
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

  private async warn(
    context:
      | Context<TelegramUpdate.MessageUpdate>
      | Context<TelegramUpdate.EditedMessageUpdate>,
    message:
      | TelegramUpdate.MessageUpdate["message"]
      | TelegramUpdate.EditedMessageUpdate["edited_message"],
    reason: string,
    announceReason?: string,
    user?: UserDocument
  ): Promise<WarnResult> {
    const result = await this.moderationService.warnUser(
      context.chat.id,
      context.from.id,
      undefined,
      reason
    );

    if (!user) {
      user = await this.userService.getUser(
        context.chat.id,
        context.from.id,
        context.from
      );
    }

    if (!announceReason) {
      announceReason = reason;
    }

    const name = user?.name || "User";

    if (result === WarnResult.WARNED) {
      await this.reply(
        context,
        message,
        `${name} has been warned for: ${announceReason}.`
      ).catch((error) => {
        this.logger.error("Failed to send acknowledge for warn:", error);
      });
    } else if (result === WarnResult.MUTED) {
      await this.reply(
        context,
        message,
        `${name} has been banned for: ${announceReason} after reaching the warning limit.`
      ).catch((error) => {
        this.logger.error("Failed to send acknowledge for ban:", error);
      });
    } else {
      await this.reply(
        context,
        message,
        `Failed to issue a warning for: ${announceReason}.`
      ).catch((error) => {
        this.logger.error(
          "Unable to send nor failure message nor acknowledge failure:",
          error
        );
      });
    }

    return result;
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

      try {
        answer = await this.messageService.handleMessageAnswerProcessing(
          context.chat.id,
          this.characterService.rephrase(
            context.chat.id,
            message.from.id,
            answer,
            toUser
          ),
          60
        );
      } catch (error) {
        this.logger.error("Error rephrasing moderation reply:", error);
      }
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
