import { Context } from "telegraf";
import { ChatConfigDocument } from "@core/entity/chat-config.entity";
import { Deunionize } from "telegraf/typings/core/helpers/deunionize";
import { Update } from "telegraf/types";

export type ChatConfigContextExtension = {
  chatConfig: ChatConfigDocument;
};

export type ContextWithChatConfig<T extends Deunionize<Update> = Update> =
  Context<T> & ChatConfigContextExtension;
