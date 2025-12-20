import { z } from "zod";
import { Behavior } from "@google/genai";
import { ZodTypeAny } from "zod/v3";

export type ToolFunctionArgument = {
  code: string;
  type: z.ZodType;
  order: number;
};

export type ToolFunctionMetadata = {
  code: string;
  description: string;
  behavior?: Behavior;
  arguments: Array<ToolFunctionArgument>;
};

export type ToolFunctionSchema<T, K extends keyof T = keyof T> = {
  [P in K]?: ToolFunctionMetadata;
};

export type ModelCallableToolFunction<T extends ZodTypeAny = ZodTypeAny> = {
  (args: z.infer<T>): Promise<string> | string;
  code: string;
  behavior?: Behavior;
  description: string;
  arguments: T;
};
