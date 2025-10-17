import { MessageDocument } from "@core/entity/message.entity";

export type MessageDocumentWithChain = MessageDocument & {
  isInChain?: boolean;
};
