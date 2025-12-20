import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import {
  ScheduledTaskDocument,
  ScheduledTaskEntity,
} from "@core/entity/scheduled-task.entity";
import { Model } from "mongoose";

@Injectable()
export class TaskService {
  private readonly logger = new Logger("Core/TaskService");

  private readonly taskHandlers: Map<
    string,
    (...args: Array<unknown>) => Promise<unknown>
  > = new Map();

  constructor(
    @InjectModel(ScheduledTaskEntity.COLLECTION_NAME)
    private readonly scheduledTaskModel: Model<ScheduledTaskEntity>
  ) {}

  public registerHandler(
    taskCode: string,
    handler: (...args: Array<unknown>) => Promise<unknown>
  ) {
    this.taskHandlers.set(taskCode, handler);
  }

  public async scheduleTask(
    chatId: string,
    taskCode: string,
    args: Array<unknown>,
    executeAt: Date,
    cronPattern?: string,
    expireAt?: Date
  ) {
    const scheduledTask = new this.scheduledTaskModel({
      chatId,
      task: taskCode,
      arguments: args,
      executeAt,
      cronPattern,
      expireAt,
    });
    await scheduledTask.save();
    this.logger.log(
      `Scheduled task ${taskCode} for chat ${chatId} at ${executeAt.toISOString()}`
    );
  }

  /**
   * Reschedule an existing task to a new execution time.
   * If no newExecuteAt is provided, the task is rescheduled based on its cron pattern.
   * If no cron pattern is set, exception is thrown.
   * @param task
   * @param newExecuteAt
   */
  public async rescheduleTask(
    task: ScheduledTaskDocument,
    newExecuteAt?: Date
  ) {

  }

  public async execute(task: ScheduledTaskDocument) {
    const handler = this.taskHandlers.get(task.code);
    if (!handler) {
      throw new Error(`No handler registered for task code: ${task.code}`);
    }
  }

  public async work() {
    const now = new Date();
    const tasks = await this.scheduledTaskModel
      .find({
        executeAt: { $lte: now },
        finishedAt: { $exists: false },
      })
      .exec();

    for (const task of tasks) {
      this.logger.log(
        `Executing task: ${task.code} with args: ${task.arguments}`
      );
      try {
        await this.execute(task);
        task.finishedAt = new Date();
        await task.save();
        this.logger.log(`Task ${task.code} completed successfully.`);
      } catch (error) {
        task.
        task.errorMessage = error.message;
        await task.save();
        this.logger.error(
          `Task ${task.code} failed with error: ${error.message}`
        );
      } finally {
        await task.save();

        // If the task is recurring, schedule the next execution
        if (task.cronPattern) {
          const cron = require("cron");
          const interval = cron.parseExpression(task.cronPattern, {
            currentDate: task.executeAt,
          });
          const nextExecuteAt = interval.next().toDate();
          this.logger.log(
            `Rescheduling recurring task ${task.code} for ${nextExecuteAt.toISOString()}`
          );
          const newTask = new this.scheduledTaskModel({
            chatId: task.chatId,
            task: task.code,
            arguments: task.arguments,
            executeAt: nextExecuteAt,
            cronPattern: task.cronPattern,
            expireAt: task.expireAt,
          });
          await newTask.save();
        }
      }
    }
  }
}
