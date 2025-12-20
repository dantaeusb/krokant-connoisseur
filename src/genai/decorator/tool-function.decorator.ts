import { z, ZodType } from "zod";
import { AbstractToolService } from "@genai/service/abstract-tool.service";
import { Behavior } from "@google/genai";
import { ToolFunctionArgument } from "@genai/types/tool.type";

type UnorderedToolFunctionArgument = Omit<ToolFunctionArgument, "order">;

type ZodInferTuple<T extends readonly UnorderedToolFunctionArgument[]> = {
  [K in keyof T]: z.infer<T[K]["type"]>;
};

export const ChatScopedToolFunction = <
  const S extends readonly UnorderedToolFunctionArgument[]
>(
  code: string,
  description: string,
  unorderedArguments: S,
  behavior?: Behavior
) => {
  return <
    K extends string,
    O extends {
      [key in K]: (chatId: number, ...args: ZodInferTuple<S>) => unknown;
    }
  >(
    target: O & AbstractToolService,
    propertyKey: K
  ) => {
    target.schema[propertyKey] = {
      code: target.code + "." + code,
      description,
      arguments: unorderedArguments.map((type, index) => ({
        ...type,
        order: index,
      })),
      behavior: behavior ?? Behavior.NON_BLOCKING,
    };
  };
};
