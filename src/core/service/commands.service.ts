import { Injectable, Logger } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import {
  BotCommandScopeAllChatAdministrators,
  BotCommandScopeAllGroupChats,
  BotCommandScopeAllPrivateChats,
} from "@telegraf/types/settings";
import { Semaphore } from "async-mutex";
import { BotCommand } from "@telegraf/types/manage";
import parse from "parse-duration";

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

  public extractCommandDurationMut(args: string[]): number | null {
    if (args.length === 0) {
      return null;
    }

    for (let argsLeft = args.length; argsLeft > 0; argsLeft--) {
      const attempt = args.slice(0, argsLeft).join(" ");
      const duration: number = parse(attempt);

      if (duration !== null && !isNaN(duration) && duration > 0) {
        args.splice(0, argsLeft);
        return duration;
      }
    }

    return null;
  }

  public extractCommandIntegerMut(
    args: string[],
    strict = false
  ): number | null {
    if (args.length === 0) {
      return null;
    }

    const supposedInteger = args[0].trim();
    const parsed = parseInt(supposedInteger, 10);

    if (!isNaN(parsed) && (!strict || parsed.toString() === supposedInteger)) {
      args.shift();
      return parsed;
    }

    return null;
  }

  public extractCommandExactStringMut(
    args: string[],
    strings: string[]
  ): string | null {
    if (args.length === 0) {
      return null;
    }

    const supposedString = args[0].trim().toLowerCase();

    for (const str of strings) {
      if (supposedString === str.toLowerCase()) {
        args.shift();
        return str;
      }
    }

    return null;
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
