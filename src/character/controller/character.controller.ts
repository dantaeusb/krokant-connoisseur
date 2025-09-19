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
import { CharacterService } from "@character/service/character.service";
import { Update as TelegramUpdate } from "telegraf/types";
import { TriggerService } from "@character/service/trigger.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";
import { FormatterService } from "@core/service/formatter.service";
import { AdminGuard } from "@core/guard/admin.guard";
import { CommandsService } from "@core/service/commands.service";

/**
 * Handles character talking and responses.
 * @todo: Find a way to remove deleted messages.
 * @todo: Update messages when edited.
 * @todo: Prepare summaries and clean up old messages.
 */
@Update()
export class CharacterController {
  private readonly logger = new Logger("Character/TalkingController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly commandsService: CommandsService,
    private readonly characterService: CharacterService,
    private readonly triggerService: TriggerService,
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly formatterService: FormatterService
  ) {
    Promise.all([
      this.commandsService.extendCommands(
        "all_chat_administrators",
        [
          {
            command: "ignore_user",
            description:
              "Do not collect messages and do not respond to that user",
          },
          {
            command: "unignore_user",
            description: "Collect messages and respond to that user",
          },
        ],
        "Character"
      ),
      this.commandsService.extendCommands(
        "all_group_chats",
        [
          {
            command: "ignoreme",
            description: "Do not collect messages and respond to you",
          },
          {
            command: "unignoreme",
            description: "Collect messages and respond to you",
          },
          {
            command: "forgetme",
            description: "Delete all messages and information about you",
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
    this.logger.log("Handling message for possible character response");

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

    const response = await this.characterService.respond(
      context.chat.id,
      message.message_id,
      context.text,
      user
    );

    const result = await context.reply(
      this.formatterService.escapeMarkdownV2(response),
      {
        parse_mode: "Markdown",
        reply_parameters: {
          chat_id: context.chat.id,
          message_id: message.message_id,
          allow_sending_without_reply: false,
        },
      }
    );

    void this.messageService.recordBotMessage(
      context.chat.id,
      result.message_id,
      response,
      message.message_id,
      result.date
    );

    return next();
  }

  @Command("ignoreme")
  async ignoreme(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /ignoreme command");

    this.userService
      .setIgnore(context.chat.id, context.from.id, true)
      .then(() => {
        context.sendMessage(
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
        context.sendMessage("Failed to update your ignore status!", {
          reply_parameters: {
            message_id: message.message_id,
            chat_id: context.chat.id,
            allow_sending_without_reply: true,
          },
        });
      });
  }

  @Command("unignoreme")
  public async unignoreme(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log("Handling /unignoreme command");

    this.userService
      .setIgnore(context.chat.id, context.from.id, false)
      .then(() => {
        context.sendMessage("You will no longer be ignored.", {
          reply_parameters: {
            message_id: message.message_id,
            chat_id: context.chat.id,
            allow_sending_without_reply: true,
          },
        });
      })
      .catch((error) => {
        this.logger.error("Failed to update user ignore status", error);
        context.sendMessage("Failed to update your ignore status!", {
          reply_parameters: {
            message_id: message.message_id,
            chat_id: context.chat.id,
            allow_sending_without_reply: true,
          },
        });
      });
  }

  @Command("ignore_user")
  @UseGuards(AdminGuard)
  async ignoreUser(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log("Handling /ignore_user command");

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
    this.logger.log("Handling /unignore_user command");

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
    this.logger.log("Handling /forgetme command");

    context.sendMessage("Can't do that yet ask @dantaeusb to do that.", {
      reply_parameters: {
        message_id: message.message_id,
        chat_id: context.chat.id,
        allow_sending_without_reply: true,
      },
    });
  }
}
