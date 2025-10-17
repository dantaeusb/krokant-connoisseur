import { Injectable, Logger } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import {
  BotCommandScope,
  BotCommandScopeAllChatAdministrators,
  BotCommandScopeAllGroupChats,
  BotCommandScopeAllPrivateChats,
} from "@telegraf/types/settings";
import { Semaphore } from "async-mutex";
import { BotCommand } from "@telegraf/types/manage";

type BotCommandScopeType =
  | BotCommandScopeAllPrivateChats["type"]
  | BotCommandScopeAllGroupChats["type"]
  | BotCommandScopeAllChatAdministrators["type"];

type ExtendedBotCommand = BotCommand & {
  forModule: string;
  detailedDescription?: string;
};

@Injectable()
export class CommandsService {
  private readonly logger = new Logger("Core/CommandsService");

  private wiped = false;
  private initializationSemaphore = new Semaphore(1);
  private commands: Map<BotCommandScopeType, Array<ExtendedBotCommand>> =
    new Map();

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>
  ) {
    this.commands.set("all_private_chats", []);
    this.commands.set("all_group_chats", []);
    this.commands.set("all_chat_administrators", []);
  }

  public async extendCommands(
    scope: BotCommandScopeType,
    commands: Array<ExtendedBotCommand>,
    forModule: string
  ): Promise<boolean> {
    // @todo: [HIGH] Semaphore probably should work for every scope separately.
    // otherwise two simultaneous calls for different scopes will overwrite each other.
    await this.initializationSemaphore
      .acquire(1)
      .then(async ([_, release]) => {
        if (this.wiped) {
          release();
          return;
        }

        await this.bot.telegram
          .setMyCommands([])
          .then(() => {
            this.logger.debug("Cleared all commands");
          })
          .catch((error) => {
            this.logger.error("Failed to clear commands:", error);
          })
          .finally(() => {
            this.wiped = true;
            release();
          });
      })
      .catch((error) => {
        this.logger.error("Failed to acquire semaphore:", error);
      })
      .finally(() => {
        this.bot.telegram
          .getMyCommands({
            scope: {
              type: scope,
            },
          })
          .then(async (existingCommands) => {
            await this.bot.telegram.setMyCommands(
              [...existingCommands, ...commands],
              {
                scope: {
                  type: scope,
                },
              }
            );

            this.commands.get(scope).push(...commands);

            this.logger.debug(`Set ${forModule} commands for scope ${scope}`);
          })
          .catch((error) => {
            this.logger.error("Failed to set tools admin commands:", error);
          });
      });

    return true;
  }

  public getCommands(scope: BotCommandScopeType): Array<ExtendedBotCommand> {
    return this.commands.get(scope) || [];
  }

  /**
   * Get text following the command in a message.
   * @param text
   */
  public getCommandArgumentString(text: string): string | null {
    const parts = text.trim().split(" ");
    if (parts.length <= 1) {
      return null;
    }
    parts.shift();
    return parts.join(" ").trim();
  }

  /**
   * Extracts command arguments from a message text.
   * I.e. /ban 1 day -> ["1", "day"]
   * @param text
   */
  public getCommandMessageArguments(text: string): Array<string> {
    const parts = text.trim().split(" ");
    if (parts.length <= 1) {
      return [];
    }
    parts.shift();
    return parts;
  }

  /**
   * Warning! It's mutating the args array if the first arg looks like a handle!
   * @param args
   */
  public extractCommandGroupHandleMut(args: string[]): string | null {
    if (args.length === 0) {
      return null;
    }

    let supposedHandle = args[0].trim();

    if (supposedHandle.startsWith("!") && supposedHandle.length > 1) {
      supposedHandle = supposedHandle.slice(1);
    }

    if (/^[a-zA-Z0-9_]{5,32}$/.test(supposedHandle)) {
      args.shift();
      return supposedHandle;
    }

    return null;
  }

  /**
   * Warning! It's mutating the args array if the first arg looks like a handle!
   * @param args
   */
  public extractCommandHandleMut(args: string[]): string | null {
    if (args.length === 0) {
      return null;
    }

    let supposedHandle = args[0].trim();

    if (supposedHandle.startsWith("@") && supposedHandle.length > 1) {
      supposedHandle = supposedHandle.slice(1);
    }

    if (/^[a-zA-Z0-9_]{5,32}$/.test(supposedHandle)) {
      args.shift();
      return supposedHandle;
    }

    return null;
  }
}
