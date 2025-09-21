import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import {
  InjectBot,
  TelegrafException,
  TelegrafExecutionContext,
} from "nestjs-telegraf";
import { Context } from "../interface/context.interface";
import { AuthorityService } from "../service/authority.service";
import { ClankerBotName } from "@/app.constants";
import { Telegraf } from "telegraf";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectBot(ClankerBotName) private readonly bot: Telegraf<Context>,
    private readonly authorityService: AuthorityService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const telegrafContext = TelegrafExecutionContext.create(context);
    const { msgId, chat, from } =
      telegrafContext.getContext<Context>();

    if (!chat || !from) {
      throw new TelegrafException("No char or user information found");
    }

    const isAdmin = await this.authorityService.isAdmin(chat.id, from.id);

    if (!isAdmin) {
      this.bot.telegram.deleteMessage(chat.id, msgId).catch((error) => {
        console.error("Failed to delete unauthorized message:", error);
      });

      console.log(`User ${from.id} is not an admin`);
      throw new TelegrafException("No permission to use this command");
    }

    return true;
  }
}
