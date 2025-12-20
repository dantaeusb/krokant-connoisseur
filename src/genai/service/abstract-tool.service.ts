import {
  ModelCallableToolFunction,
  ToolFunctionSchema,
} from "@genai/types/tool.type";
import { Logger } from "@nestjs/common";
import z from "zod";

export abstract class AbstractToolService {
  public readonly code: string;
  protected readonly logger: Logger;

  public schema: ToolFunctionSchema<this> = {};

  public getScopedFunctions(chatId: number): Array<ModelCallableToolFunction> {
    return Object.entries(this.schema).map(
      ([fn, fnSchema]): ModelCallableToolFunction => {
        return Object.assign(
          (inArgs: Record<string, unknown>) => {
            try {
              const outArgs = [];

              for (const [code, value] of Object.entries(inArgs)) {
                const argMeta = fnSchema.arguments?.find(
                  (arg) => arg.code === code
                );

                if (!argMeta) {
                  throw new Error(
                    `Argument with code "${code}" not found in function "${fn}"`
                  );
                }

                outArgs[argMeta.order] = argMeta.type.parse(value);
              }

              return this[fn].apply(this, [chatId, ...Array.from(outArgs)]);
            } catch (err) {
              this.logger.error(err);
              return Promise.reject(err);
            }
          },
          {
            ...fnSchema,
            arguments: z.object(
              fnSchema.arguments.reduce(
                (acc, arg) => ({
                  ...acc,
                  [arg.code]: arg.type,
                }),
                {}
              )
            ),
          }
        );
      }
    );
  }
}
