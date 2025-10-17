import { Injectable } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";

@Injectable()
export class AuthorityService {
  // @todo: the right thing – this is basically a backdoor for me to access any group
  private static readonly SUPER_ADMIN_IDS = [132524050];

  constructor(
    @InjectBot(BotName) private readonly bot: Telegraf<Context>
  ) {}

  public async isAdmin(chatId: number, userId: number): Promise<boolean> {
    if (AuthorityService.SUPER_ADMIN_IDS.includes(userId)) {
      return true;
    }

    const admins = await this.bot.telegram.getChatAdministrators(chatId);

    return admins.some((admin) => admin.user.id === userId);
  }
}
