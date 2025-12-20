import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Task } from "@core/type/task";

export type ScheduledTaskDocument = HydratedDocument<ScheduledTaskEntity>;

export type ScheduledTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "rescheduled"
  | "expired";

@Schema({ timestamps: true })
export class ScheduledTaskEntity implements Task {
  public static COLLECTION_NAME = "scheduled_task";

  @Prop({ required: true, index: true })
  chatId: string;

  @Prop()
  executeAt: Date;

  /**
   * If a task is recurring, cron pattern for next executions
   */
  @Prop()
  cronPattern: string;

  /**
   * Expiration date after which the task should not be executed
   */
  @Prop()
  expireAt: Date;

  /**
   * Task code to be executed, connected to a handler
   */
  @Prop()
  code: string;

  /**
   * Arguments for the handler
   */
  @Prop()
  arguments: Array<unknown>;

  @Prop()
  startedAt: Date;

  @Prop()
  finishedAt: Date;

  @Prop()
  errorMessage: string;
}

export const ScheduledTaskSchema =
  SchemaFactory.createForClass(ScheduledTaskEntity);
