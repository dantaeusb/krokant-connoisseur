import { Injectable, Logger } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { ClankerBotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import {
  BotCommandScope,
  BotCommandScopeAllChatAdministrators,
  BotCommandScopeAllGroupChats,
  BotCommandScopeAllPrivateChats,
} from "@telegraf/types/settings";
import { BotCommand } from "@telegraf/types/manage";

@Injectable()
export class CommandsService {
  private readonly logger = new Logger("Core/CommandsService");

  private wiped = false;

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>
  ) {}

  public async extendCommands(
    scope:
      | BotCommandScopeAllPrivateChats["type"]
      | BotCommandScopeAllGroupChats["type"]
      | BotCommandScopeAllChatAdministrators["type"],
    commands: Array<BotCommand>,
    forModule: string
  ): Promise<boolean> {
    if (!this.wiped) {
      this.wiped = true;

      await this.bot.telegram
        .setMyCommands([])
        .then(() => {
          this.logger.debug("Cleared all commands");
        })
        .catch((error) => {
          this.logger.error("Failed to clear commands:", error);
        });
    }

    this.bot.telegram
      .getMyCommands({
        scope: {
          type: scope,
        },
      })
      .then((existingCommands) => {
        this.bot.telegram.setMyCommands([...existingCommands, ...commands], {
          scope: {
            type: scope,
          },
        });
        this.logger.debug(`Set ${forModule} commands for scope ${scope}`);
      })
      .catch((error) => {
        this.logger.error("Failed to set tools admin commands:", error);
      });

    return true;
  }
}
