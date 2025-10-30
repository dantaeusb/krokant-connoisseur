import { Ctx, Next, On, Update } from "nestjs-telegraf";
import { Logger } from "@nestjs/common";
import { Update as TelegramUpdate } from "telegraf/types";
import { Context } from "telegraf";
import { UserService } from "../service/user.service";
import { MessageService } from "../service/message.service";

@Update()
export class LoggingController {
  private readonly logger = new Logger("Core/LoggingController");

  constructor(
    private readonly userService: UserService,
    private readonly messageService: MessageService
  ) {}

  @On("edited_message")
  public async updateMessage(
    @Ctx()
    context: Context<TelegramUpdate.EditedMessageUpdate>,
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.debug("Handling edited message for logging");
    try {
      const edited = context.update.edited_message;

      this.userService
        .updateLastActivity(context.chat.id, context.from.id)
        .catch((error) => {
          this.logger.error("Error updating last activity:", error);
        });

      if ("text" in edited && edited.text) {
        const message = await this.messageService.updateMessage(context);
        this.logger.debug("Successfully updated message text");
      } else {
        this.logger.debug("Edited message is not text-based");
      }
    } catch (error) {
      this.logger.error("Error updating message:", error);
    }

    await next();
  }

  @On("message")
  //@On("photo")
  public async recordMessage(
    @Ctx()
    context: Context<TelegramUpdate.MessageUpdate>,
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.debug("Handling message for logging");

    this.userService
      .updateLastActivity(context.chat.id, context.from.id)
      .catch((error) => {
        this.logger.error("Error updating last activity:", error);
      });

    return await new Promise<void>((resolve, reject) => {
      this.userService
        .getUser(context.chat.id, context.from.id, context.from)
        .then((user) => {
          if (!user) {
            this.logger.error("Could not find or create user.");
            return resolve();
          }

          if (!user.ignore) {
            this.messageService
              .recordMessage(context)
              .then(() => resolve())
              .catch(reject);
          } else {
            this.messageService
              .recordHiddenMessage(context)
              .then(() => resolve())
              .catch(reject);
          }

          return resolve();
        })
        .catch(reject);
    })
      .then(() => {
        next();
      })
      .catch((error) => {
        this.logger.error("Error recording message: " + error);
        next();
      });
  }
}
