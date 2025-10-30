import {
  Command,
  Ctx,
  InjectBot,
  Message,
  Next,
  Update,
} from "nestjs-telegraf";
import { Logger, UseGuards } from "@nestjs/common";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { AdminGuard } from "@core/guard/admin.guard";
import { Update as TelegramUpdate } from "telegraf/types";
import { ConfigService } from "@core/service/config.service";

@Update()
export class ConfigController {
  private readonly logger = new Logger("Core/ConfigController");

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService
  ) {}

  @Command("reload")
  @UseGuards(AdminGuard)
  async reload(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.log("Handling /reload command");

    try {
      await this.configService.reload(context.chat.id);
      context.react("👌").catch((err: Error) => {
        this.logger.error("Failed to react to /reload command", err);
      });
    } catch (error) {
      this.logger.error("Failed to reload configurations", error);
      context.react("🤷‍♀").catch((err: Error) => {
        this.logger.error("Failed to react to /reload command", err);
      });
    }

    await next();
  }

  @Command("debug")
  @UseGuards(AdminGuard)
  async debug(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log("Handling /debug command");

    await this.configService
      .setDebugging(context.chat.id, true)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to update config", error);
        context.react("🤷‍♀");
      });
  }

  @Command("stop_debug")
  @UseGuards(AdminGuard)
  async stopDebug(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log("Handling /stop_debug command");

    await this.configService
      .setDebugging(context.chat.id, false)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to update config", error);
        context.react("🤷‍♀");
      });
  }

  @Command("sybau")
  @UseGuards(AdminGuard)
  async sybau(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log(
      "Handling /sybau command (reduce LLM talking & stop rephrasing)"
    );

    const result = await this.configService
      .setYapping(context.chat.id, false)
      .then(() => true)
      .catch((error) => {
        this.logger.error("Failed to toggle yapping", error);
        return false;
      });

    if (result) {
      context.react("👌");
    } else {
      context.react("🤷‍♀");
    }
  }

  @Command("yapping")
  @UseGuards(AdminGuard)
  async yapping(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log(
      "Handling /yapping command (increase LLM talking & start rephrasing)"
    );

    const result = await this.configService
      .setYapping(context.chat.id, true)
      .then(() => true)
      .catch((error) => {
        this.logger.error("Failed to toggle yapping", error);
        return false;
      });

    if (result) {
      context.react("👌");
    } else {
      context.react("🤷‍♀");
    }
  }
}
