import { Injectable, Logger } from "@nestjs/common";
import { PersonService } from "@roleplay/service/person.service";
import { TaskService } from "@core/service/task.service";
import { ScheduledTaskDocument } from "@core/entity/scheduled-task.entity";

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

  public async run(chatId: number, userId: number) {}

  public async getTask(
    chatId: number,
    userId: number
  ): Promise<ScheduledTaskDocument | null> {
    return null;
  }
}