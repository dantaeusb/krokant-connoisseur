import {
  ExecutionContext,
  createParamDecorator,
} from "@nestjs/common";
import { TelegrafExecutionContext } from "nestjs-telegraf";
import { ContextWithChatConfig } from "@core/type/context";

export const ChatConfig = createParamDecorator((_, ctx: ExecutionContext) => {
  const context: ContextWithChatConfig = TelegrafExecutionContext.create(ctx).getContext();

  return context.chatConfig;
});
