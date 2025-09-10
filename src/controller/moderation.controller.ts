import { UseGuards } from "@nestjs/common";
import { Command, InjectBot, Message, Sender, Update } from "nestjs-telegraf";
import { ModerationService } from "../service/moderation.service";
import { AdminGuard } from "../guards/admin.guard";
import { ClankerBotName } from "../app.constants";
import { Context } from "../interfaces/context.interface";
import { Telegraf } from "telegraf";

@Update()
export class ModerationController {
  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly moderationService: ModerationService
  ) {}

  @Command("warn")
  @UseGuards(AdminGuard)
  async warn(
    @Sender("id") senderId: number,
    @Message() message: Context
  ): Promise<void> {
    message.reply("Processing warning...");
  }

  @Command("clear")
  @UseGuards(AdminGuard)
  async clear(
    @Sender("id") senderId: number,
    @Message() message: Context
  ): Promise<void> {
    message.reply("Processing clear...");
  }

  @Command("ban")
  @UseGuards(AdminGuard)
  async ban(
    @Sender("id") senderId: number,
    @Message() message: Context
  ): Promise<void> {
    message.reply("Processing warning...");
  }

  @Command("unban")
  @UseGuards(AdminGuard)
  async unban(
    @Sender("id") senderId: number,
    @Message() message: Context
  ): Promise<void> {
    message.reply("Processing warning...");
  }
}
