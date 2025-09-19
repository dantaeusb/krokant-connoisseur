import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { TelegrafException, TelegrafExecutionContext } from "nestjs-telegraf";
import { Context } from "../interface/context.interface";
import { AuthorityService } from "../service/authority.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authorityService: AuthorityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const telegrafContext = TelegrafExecutionContext.create(context);
    const { msgId, chat, from, deleteMessage } =
      telegrafContext.getContext<Context>();

    if (!chat || !from) {
      throw new TelegrafException("No char or user information found");
    }

    const isAdmin = await this.authorityService.isAdmin(
      chat.id,
      from.id
    );

    if (!isAdmin) {
      deleteMessage(msgId).catch((error) => {
        console.error("Failed to delete unauthorized message:", error);
      });

      console.log(`User ${from.id} is not an admin`);
      throw new TelegrafException("No permission to use this command");
    }

    return true;
  }
}
