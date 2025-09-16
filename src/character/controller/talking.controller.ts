import { InjectBot, Message, On, Update, Ctx, Next } from "nestjs-telegraf";
import { Telegraf, Context } from "telegraf";
import { ClankerBotName } from "@/app.constants";
import { Logger } from "@nestjs/common";
import { CharacterService } from "@character/service/character.service";
import { Update as TelegramUpdate } from "telegraf/types";
import { TriggerService } from "@character/service/trigger.service";
import { MessageService } from "@core/service/message.service";
import { UserService } from "@core/service/user.service";

/**
 * Handles character talking and responses.
 * @todo: Find a way to remove deleted messages.
 * @todo: Update messages when edited.
 * @todo: Prepare summaries and clean up old messages.
 */
@Update()
export class TalkingController {
  private readonly logger = new Logger("Character/TalkingController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly characterService: CharacterService,
    private readonly triggerService: TriggerService,
    private readonly messageService: MessageService,
    private readonly userService: UserService
  ) {}

  @On("message")
  public async messageReply(
    @Ctx()
    context: Context<TelegramUpdate.MessageUpdate>,
    @Message()
    message: TelegramUpdate.MessageUpdate["message"],
    @Next() next: () => Promise<void>
  ): Promise<void> {
    this.logger.log("Handling message");

    if (!context.text) {
      return next();
    }

    let triggered = false;
    let botWasMentioned: boolean = context
      .entities("mention")
      .some((entity) => entity.fragment === context.botInfo.username);

    botWasMentioned =
      botWasMentioned ||
      ("reply_to_message" in message &&
        message.reply_to_message?.from.id === context.botInfo.id);

    if (botWasMentioned && this.triggerService.isTriggered(1)) {
      this.logger.log("Triggered by mention");
      triggered = true;
    }

    if (this.triggerService.triggered(context.text)) {
      this.logger.log("Triggered by keyword");
      triggered = true;
    }

    if (!triggered) {
      return next();
    }

    const user = await this.userService.getUser(
      context.chat.id,
      message.from.id
    );

    if (!user) {
      this.logger.error("Could not find user.");
      return next();
    }

    const response = await this.characterService.respond(
      context.chat.id,
      message.message_id,
      context.text,
      user
    );

    const result = await context.reply(response, {
      reply_parameters: {
        chat_id: context.chat.id,
        message_id: message.message_id,
        allow_sending_without_reply: false,
      },
    });

    void this.messageService.recordBotMessage(
      context.chat.id,
      result.message_id,
      response,
      message.message_id,
      result.date,
    );

    return next();
  }
}
