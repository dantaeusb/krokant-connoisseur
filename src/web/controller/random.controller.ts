import { Controller, Get, Logger, Param } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";

@Controller("random")
export class RandomController {
  private readonly logger = new Logger("Web/RandomController");

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>
  ) {}

  @Get(":chatId")
  async get(@Param("chatId") chatId: string): Promise<string> {
    const result = await this.bot.telegram.sendDice(chatId);

    return result.dice.value.toString();
  }
}
