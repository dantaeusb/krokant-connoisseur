import { Ctx, InjectBot, Message, Next, On, Update } from "nestjs-telegraf";
import { Logger } from "@nestjs/common";
import { Update as TelegramUpdate } from "telegraf/types";
import { ClankerBotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { ConfigService } from "../service/config.service";
import { UserService } from "../service/user.service";
import { MessageService } from "../service/message.service";

@Update()
export class LoggingController {
  private readonly logger = new Logger("Core/LoggingController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly messageService: MessageService
  ) {}

  @On("message")
  public async recordMessage(
    @Ctx()
    context: Context<TelegramUpdate.MessageUpdate>,
    @Message()
    message: TelegramUpdate.MessageUpdate["message"],
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.log("Handling message for logging");

    if (!context.text) {
      return next();
    }

    return await new Promise<void>((resolve, reject) => {
      this.userService
        .getUser(message.chat.id, message.from.id, message.from)
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
