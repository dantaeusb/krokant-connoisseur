import {
  InjectBot,
  Message,
  On,
  Update,
  Ctx,
  Next,
  Command,
} from "nestjs-telegraf";
import { Telegraf, Context } from "telegraf";
import { ClankerBotName } from "@/app.constants";
import { Logger, UseGuards } from "@nestjs/common";
import { Update as TelegramUpdate } from "telegraf/types";
import { UserService } from "@core/service/user.service";
import { FormatterService } from "@core/service/formatter.service";
import { AdminGuard } from "@core/guard/admin.guard";
import { CommandsService } from "@core/service/commands.service";
import { MessageService } from "@core/service/message.service";
import { TriggerService } from "../service/trigger.service";
import { CharacterService } from "../service/character.service";
import { PersonService } from "../service/person.service";
import { ConversationService } from "../service/conversation.service";

/**
 * Handles character talking and responses.
 * @todo: Find a way to remove deleted messages.
 * @todo: Update messages when edited.
 * @todo: Prepare summaries and clean up old messages.
 */
@Update()
export class CharacterController {
  private readonly logger = new Logger("Roleplay/TalkingController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly commandsService: CommandsService,
    private readonly characterService: CharacterService,
    private readonly triggerService: TriggerService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly personService: PersonService,
    private readonly conversationService: ConversationService,
    private readonly formatterService: FormatterService
  ) {
    Promise.all([
      this.commandsService.extendCommands(
        "all_chat_administrators",
        [
          {
            forModule: "Character",
            command: "ignore_user",
            description:
              "Do not collect messages and do not respond to that user",
            detailedDescription:
              "Allows admin to to opt out user from the bot responses, and hides that user's messages from the bot." +
              "The bot will be aware that message is sent, but will not see its contents.",
          },
          {
            forModule: "Character",
            command: "unignore_user",
            description: "Collect messages and respond to that user",
            detailedDescription:
              "Reverts the effect of /ignore_user command, allowing the bot to see and respond to the mentioned user again." +
              "Previously sent messages will not be restored.",
          },
        ],
        "Character"
      ),
      this.commandsService.extendCommands(
        "all_group_chats",
        [
          {
            forModule: "Character",
            command: "ignoreme",
            description: "Do not collect messages and respond to you",
            detailedDescription:
              "Allows user to opt out from the bot responses, and hides their messages from the bot." +
              "The bot will be aware that message is sent, but will not see its contents.",
          },
          {
            forModule: "Character",
            command: "unignoreme",
            description: "Collect messages and respond to you",
            detailedDescription:
              "Reverts the effect of /ignoreme command, allowing the bot to see and respond to that user again." +
              "Previously sent messages will not be restored.",
          },
          {
            forModule: "Character",
            command: "forgetme",
            description: "Delete all messages and information about you",
            detailedDescription:
              "Deletes all messages and information about you from the bot's memory." +
              "The bot will forget you ever existed, apart from the moderation stats like bans. This action is irreversible.",
          },
        ],
        "Character"
      ),
    ]);
  }

  @On("message")
  public async messageReply(
    @Ctx()
    context: Context<TelegramUpdate.MessageUpdate>,
    @Message()
    message: TelegramUpdate.MessageUpdate["message"],
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.debug("Handling message for possible character response");

    if (!context.text) {
      return next();
    }

    let triggered = false;
    let botWasMentioned: boolean = context
      .entities("mention")
      .some((entity) => entity.fragment === context.botInfo.username);

    botWasMentioned =
      botWasMentioned ||
      ("reply_to_message" in message &&
        message.reply_to_message?.from.id === context.botInfo.id);

    if (botWasMentioned && this.triggerService.isTriggered(1)) {
      this.logger.log("Triggered by mention");
      triggered = true;
    }

    if (this.triggerService.triggered(context.text)) {
      this.logger.log("Triggered by keyword");
      triggered = true;
    }

    if (!triggered) {
      return next();
    }

    const user = await this.userService.getUser(
      context.chat.id,
      message.from.id
    );

    if (!user) {
      this.logger.error("Could not find user.");
      return next();
    }

    if (user.ignore) {
      this.logger.log(
        `Ignoring message from user ${user.userId} per their settings.`
      );
      return next();
    }

    const cooldown = await this.triggerService.isOnCooldown(
      context.chat.id,
      user.userId
    );

    if (cooldown) {
      this.logger.log(`Not responding to user ${user.userId} due to cooldown.`);
      return next();
    }

    const response = await this.characterService.respond(
      context.chat.id,
      message.message_id,
      context.text,
      user
    );

    void this.messageService
      .sendMessage(context.chat.id, response, {
        parse_mode: "Markdown",
        reply_parameters: {
          chat_id: context.chat.id,
          message_id: message.message_id,
          allow_sending_without_reply: false,
        },
      })
      .catch((error) =>
        this.logger.error("Failed to send character response message", error)
      );

    void this.personService.countInteraction(context.chat.id, user.userId);

    return next();
  }

  @Command("ignoreme")
  async ignoreme(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /ignoreme command");

    this.userService
      .setIgnore(context.chat.id, context.from.id, true)
      .then(() => {
        this.messageService.sendMessage(
          context.chat.id,
          "You will be ignored. If you want to cleanup history, use `/forgetme` too.",
          {
            reply_parameters: {
              message_id: message.message_id,
              chat_id: context.chat.id,
              allow_sending_without_reply: true,
            },
          }
        );
      })
      .catch((error) => {
        this.logger.error("Failed to update user ignore status", error);
        this.messageService.sendMessage(
          context.chat.id,
          "Failed to update your ignore status!",
          {
            reply_parameters: {
              message_id: message.message_id,
              chat_id: context.chat.id,
              allow_sending_without_reply: true,
            },
          }
        );
      });
  }

  @Command("unignoreme")
  public async unignoreme(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /unignoreme command");

    this.userService
      .setIgnore(context.chat.id, context.from.id, false)
      .then(() => {
        this.messageService.sendMessage(
          context.chat.id,
          "You will no longer be ignored.",
          {
            reply_parameters: {
              message_id: message.message_id,
              chat_id: context.chat.id,
              allow_sending_without_reply: true,
            },
          }
        );
      })
      .catch((error) => {
        this.logger.error("Failed to update user ignore status", error);
        this.messageService.sendMessage(
          context.chat.id,
          "Failed to update your ignore status!",
          {
            reply_parameters: {
              message_id: message.message_id,
              chat_id: context.chat.id,
              allow_sending_without_reply: true,
            },
          }
        );
      });
  }

  @Command("ignore_user")
  @UseGuards(AdminGuard)
  async ignoreUser(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.debug("Handling /ignore_user command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to unignore.");
      context.react("🤷‍♀");
      return;
    }

    this.userService
      .setIgnore(context.chat.id, targetUserId, true)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to update user ignore status", error);
        context.react("🤷‍♀");
      });
  }

  @Command("unignore_user")
  @UseGuards(AdminGuard)
  async unignoreUser(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.debug("Handling /unignore_user command");

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    if (!targetUserId) {
      this.logger.error("Could not find target user to unignore.");
      context.react("🤷‍♀");
      return;
    }

    this.userService
      .setIgnore(context.chat.id, targetUserId, false)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to update user ignore status", error);
        context.react("🤷‍♀");
      });
  }

  @Command("forgetme")
  async forgetme(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.debug("Handling /forgetme command");

    const userId = context.from.id;
    const chatId = context.chat.id;

    try {
      const [hiddenMessagesCount, personalDataCleared] = await Promise.all([
        this.messageService.hideUserMessages(chatId, userId),
        this.personService.clearPersonalData(chatId, userId),
        this.userService.setIgnore(chatId, userId, true),
      ]);

      this.logger.log(
        `User ${userId} requested data deletion. Hidden ${hiddenMessagesCount} messages, cleared personal data: ${personalDataCleared}`
      );

      await context.sendMessage(
        `All your data has been deleted from my memory.\n\n` +
          `- Set you as ignored for future interactions\n\n` +
          `Note: Moderation records (warnings/bans) are preserved for administrative purposes.`,
        {
          reply_parameters: {
            message_id: message.message_id,
            chat_id: context.chat.id,
            allow_sending_without_reply: true,
          },
        }
      );
    } catch (error) {
      this.logger.error("Failed to process forgetme command", error);

      await context.sendMessage(
        "Failed to delete your data. Please try again or contact @dantaeusb",
        {
          reply_parameters: {
            message_id: message.message_id,
            chat_id: context.chat.id,
            allow_sending_without_reply: true,
          },
        }
      );
    }
  }

  @Command("personify")
  @UseGuards(AdminGuard)
  async personifyUsers(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.debug("Handling /personify command");

    const users = await this.userService.getAllUsersInChat(context.chat.id);

    users.forEach((user) => {
      this.personService.getPerson(context.chat.id, user.userId, true);
    });
  }

  @Command("conversation")
  @UseGuards(AdminGuard)
  async conversationCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.debug("Handling /conversation command");

    const result = await this.conversationService.processOldestUnprocessedConversation(
      context.chat.id
    );
  }
}
