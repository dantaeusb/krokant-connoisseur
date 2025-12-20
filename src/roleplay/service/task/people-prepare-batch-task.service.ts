import { Injectable, Logger } from "@nestjs/common";
import { PersonService } from "@roleplay/service/person.service";
import { TaskService } from "@core/service/task.service";
import { ScheduledTaskDocument } from "@core/entity/scheduled-task.entity";
import { Schema as GenAiOpenApiSchema, Type } from "@google/genai";

/**
 * If there's enough new characteristics and they were not refined recently,
 * schedule a refinement task to process them.
 *
 * Remove what's conflicting or redundant in the person's characteristics.
 */
@Injectable()
export class PeoplePrepareBatchTaskService {
  private readonly logger = new Logger(
    "Roleplay/PeoplePrepareBatchTaskService"
  );

  constructor(
    private readonly taskService: TaskService,
    private readonly personService: PersonService
  ) {}

  public async run(chatId: number, userId: number) {

  }

  public async getTask(
    chatId: number,
    userId: number
  ): Promise<ScheduledTaskDocument | null> {
    return null;
  }

  readonly characteristicsSchema = {
    type: Type.OBJECT,
    properties: {
      conflicts: {
        type: Type.ARRAY,
        description:
          "List of IDs of conflicting characteristics. " +
          "These characteristics should be reviewed or removed. " +
          "A conflict occurs when two or more characteristics contradict each other.",
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.NUMBER,
          },
          minItems: "2",
        },
      },
      duplicates: {
        type: Type.ARRAY,
        description:
          "List of IDs of duplicate characteristics. " +
          "These characteristics are very similar and may be redundant. " +
          "Duplicates should be merged or one should be removed.",
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.NUMBER,
          },
          minItems: "2",
        },
      },
      reinforce: {
        type: Type.ARRAY,
        description:
          "List of IDs of characteristics that appear to be used " +
          "to prepare responses in the past conversations.\n" +
          "These characteristics will increase their weight " +
          "to make them more prominent in future responses.",
        items: {
          type: Type.NUMBER,
        },
      },
      obsolete: {
        type: Type.ARRAY,
        description:
          "List of IDs of characteristics that are considered obsolete. " +
          "These characteristics have not been used in recent conversations " +
          "and may no longer be relevant.",
        items: {
          type: Type.NUMBER,
        },
      },
    },
    required: ["reinforce", "obsolete"],
  } as const satisfies GenAiOpenApiSchema;
}
