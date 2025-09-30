import {
  Command,
  Ctx,
  InjectBot,
  Message,
  Update,
} from "nestjs-telegraf";
import { Logger } from "@nestjs/common";
import { ClankerBotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { Update as TelegramUpdate } from "telegraf/types";

@Update()
export class AskController {
  private readonly logger = new Logger("GenAi/AskController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>
  ) {}

  @Command("ask")
  public async askCommand(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ) {
    this.logger.debug("Handling message for GenAI API ask");

    if (!context.text) {
      return;
    }
  }
}
