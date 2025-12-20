import { TaskService } from "./task.service";

export abstract class AbstractTaskService {
  protected readonly code: string;

  protected constructor(
    code: string,
    private readonly taskService: TaskService
  ) {
    this.code = code;

    this.taskService.registerHandler(this.code, this.run.bind(this));
  }

  public abstract run(chatId: number, ...args: Array<unknown>): Promise<void>;
}