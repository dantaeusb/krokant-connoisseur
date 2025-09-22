import {
  Command,
  Ctx,
  InjectBot,
  Message,
  Next,
  On,
  Update,
} from "nestjs-telegraf";
import { Logger, UseGuards } from "@nestjs/common";
import { ClankerBotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { Update as TelegramUpdate } from "telegraf/types";
import { AdminGuard } from "../guard/admin.guard";
import { MessageService } from "../service/message.service";
import { AuthorityService } from "../service/authority.service";
import { PingGroupService } from "../service/ping-group.service";
import { CommandsService } from "../service/commands.service";
import { UserService } from "../service/user.service";
import { UserEntity } from "@core/entity/user.entity";

@Update()
export class ToolsController {
  private readonly logger = new Logger("Core/ToolsController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly commandsService: CommandsService,
    private readonly authorityService: AuthorityService,
    private readonly messageService: MessageService,
    private readonly pingGroupService: PingGroupService,
    private readonly userService: UserService
  ) {
    Promise.all([
      this.commandsService.extendCommands(
        "all_chat_administrators",
        [
          {
            forModule: "Core",
            command: "group_create",
            description:
              "!<group_handle> Create a ping group with the given handle",
            detailedDescription:
              "Allows admins to create groups that can be pinged " +
              "by typing !<group_handle> in the chat. Users can add themselves or be added by admins.",
          },
        ],
        "Tools"
      ),
      this.commandsService.extendCommands(
        "all_group_chats",
        [
          {
            forModule: "Core",
            command: "group_add",
            description:
              "!<group_handle> [<user_handle>]? Add a user to the ping group (or yourself if no user is specified)",
            detailedDescription:
              "Allows users to add themselves to a ping group by specifying the group handle." +
              "Admins can add other users by tagging them in the command message.",
          },
        ],
        "Tools"
      ),
    ]);
  }

  @Command("group_create")
  @UseGuards(AdminGuard)
  async groupCreate(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.debug("Handling /group_create command");

    if (!context.chat.id || !context.from) {
      context.reply("This command can only be used in groups.");
      return;
    }

    const commandArguments = this.commandsService.getCommandMessageArguments(
      context.text
    );

    if (commandArguments.length === 0) {
      context.reply("Please provide a !name for the ping group.");
      return;
    }

    const handle =
      this.commandsService.extractCommandGroupHandleMut(commandArguments);

    if (!handle) {
      context.reply(
        "Invalid group name. Please use only letters, numbers, and underscores."
      );
      return;
    }

    this.pingGroupService
      .createPingGroup(context.chat.id, handle)
      .then(() => {
        context.reply(`Ping group '${handle}' created successfully.`);
      })
      .catch((error) => {
        this.logger.error("Failed to create ping group", error);
        context.reply("Failed to create ping group. It might already exist.");
      });
  }

  /**
   * @todo: better promises, target user and argument clash
   * @param context
   */
  @Command("group_add")
  async groupAdd(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.debug("Handling /group_add command");

    if (!context.chat.id || !context.from) {
      context.reply("This command can only be used in groups.");
      return;
    }

    const targetUserId = await this.messageService.getTargetUserFromMessage(
      context
    );

    const commandArguments = this.commandsService.getCommandMessageArguments(
      context.text
    );

    const handle =
      this.commandsService.extractCommandGroupHandleMut(commandArguments);

    if (!handle) {
      context.reply(
        "Invalid group name. Please use only letters, numbers, and underscores."
      );
      return;
    }

    const isAdmin = await this.authorityService.isAdmin(
      context.chat.id,
      context.from.id
    );

    // User tagged someone else in the message
    if (targetUserId && commandArguments.length > 0) {
      if (!isAdmin) {
        context.reply("Only group admins can add other users to ping groups.");
        return;
      } else {
        this.pingGroupService
          .addUserToPingGroup(context.chat.id, targetUserId, handle)
          .then((success) => {
            if (success) {
              context.reply(`User added to ping group '${handle}'.`);
            } else {
              context.reply(
                "Failed to add user to ping group. Does the group exist?"
              );
            }
          })
          .catch((error) => {
            this.logger.error("Failed to add user to ping group", error);
            context.reply(
              "Failed to add user to ping group. Does the group exist?"
            );
          });
      }
    } else {
      this.pingGroupService
        .addUserToPingGroup(context.chat.id, context.from.id, handle)
        .then((success) => {
          if (success) {
            context.reply(`You have been added to ping group '${handle}'.`);
          } else {
            context.reply(
              "Failed to add you to ping group. Does the group exist?"
            );
          }
        })
        .catch((error) => {
          this.logger.error("Failed to add user to ping group", error);
          context.reply(
            "Failed to add you to ping group. Does the group exist?"
          );
        });
    }
  }

  @On("message")
  public async recordMessage(
    @Ctx()
    context: Context<TelegramUpdate.MessageUpdate>,
    @Message()
    message: TelegramUpdate.MessageUpdate["message"],
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.debug("Handling message for group ping check");

    if (!context.text) {
      return next();
    }

    const group = await this.pingGroupService.findGroupPingHandle(
      context.chat.id,
      context.text
    );

    if (!group) {
      return next();
    }

    if (group.userIds.length === 0) {
      return;
    }

    const userIds = group.userIds;

    const users = await this.userService.getUsers(
      context.chat.id,
      group.userIds
    );

    const userById = new Map<number, UserEntity>();

    for (const user of users) {
      if (user.username) {
        userById.set(user.userId, user);
      }
    }

    const mentions = userIds
      .map((userId) => {
        const user = userById.get(userId);
        if (user && user.username) {
          if (user.username) {
            return `[@${user.username}](tg://user?id=${user.userId})`;
          }

          return `[\`${user.name}\`](tg://user?id=${user.userId})`;
        } else {
          return `[Someone](tg://user?id=${userId})`;
        }
      })
      .join(" ");

    context
      .reply(`Ping group! ${mentions}`, {
        parse_mode: "Markdown",
      })
      .catch((error) => {
        this.logger.error("Failed to send ping group message:", error);
      });
  }
}
