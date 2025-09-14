import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { TelegrafException, TelegrafExecutionContext } from "nestjs-telegraf";
import { Context } from "../interface/context.interface";

@Injectable()
export class AdminGuard implements CanActivate {
  // @todo: the right thing
  private static readonly ADMIN_IDS = [132524050];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const telegrafContext = TelegrafExecutionContext.create(context);
    const { msgId, from, deleteMessage } =
      telegrafContext.getContext<Context>();

    if (!from) {
      throw new TelegrafException("No user information found");
    }

    if (!AdminGuard.ADMIN_IDS.includes(from.id)) {
      deleteMessage(msgId).catch((error) => {
        console.error("Failed to delete unauthorized message:", error);
      });

      console.log(`User ${from.id} is not an admin`);
      throw new TelegrafException("No permission to use this command");
    }

    return true;
  }
}
