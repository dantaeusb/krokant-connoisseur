import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { TelegrafException, TelegrafExecutionContext } from "nestjs-telegraf";
import { Context } from "../interfaces/context.interface";

@Injectable()
export class AdminGuard implements CanActivate {
  private static CHAT_ADMINS_CACHE_TTL = 5 * 60 * 1000;

  private chatAdministratorsCache: Record<number, number[]> = {};
  private chatAdministratorsCacheLastUpdated: Record<number, number> = {};

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const telegrafContext = TelegrafExecutionContext.create(context);
    const { msgId, chat, from, getChatAdministrators, deleteMessage } =
      telegrafContext.getContext<Context>();

    if (!from) {
      throw new TelegrafException("No user information found");
    }

    const admins = await this.getChatAdministrators(
      chat.id,
      getChatAdministrators
    );

    if (!admins || !admins.includes(from.id)) {
      deleteMessage(msgId).catch((error) => {
        console.error("Failed to delete unauthorized message:", error);
      });

      console.log(`User ${from.id} is not an admin`);
      throw new TelegrafException("No permission to use this command");
    }

    return true;
  }

  private getChatAdministrators = async (
    chatId: number,
    getChatAdministrators: () => Promise<any[]>
  ): Promise<number[]> => {
    if (this.chatAdministratorsCache[chatId]) {
      if (
        Date.now() - this.chatAdministratorsCacheLastUpdated[chatId] >
        AdminGuard.CHAT_ADMINS_CACHE_TTL
      ) {
        void this.refreshChatAdministrators(chatId, getChatAdministrators);
      }

      return this.chatAdministratorsCache[chatId];
    }

    return this.refreshChatAdministrators(chatId, getChatAdministrators);
  };

  private async refreshChatAdministrators(
    chatId: number,
    getChatAdministrators: () => Promise<any[]>
  ): Promise<number[]> {
    try {
      const admins = await getChatAdministrators();
      this.chatAdministratorsCache[chatId] = admins.map(
        (admin) => admin.user.id
      );
      this.chatAdministratorsCacheLastUpdated[chatId] = Date.now();

      return this.chatAdministratorsCache[chatId];
    } catch (error) {
      console.error(
        `Failed to refresh administrators for chat ${chatId}:`,
        error
      );
    }
  }
}
