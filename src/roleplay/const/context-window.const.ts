import { ContextWindowType } from "@roleplay/types/context-window.type";

export const CONTEXT_WINDOW_MESSAGES_LIMIT: Record<ContextWindowType, number> =
  {
    short: 50,
    extended: 3000,
  };
