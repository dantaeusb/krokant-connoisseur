import {
  InjectBot,
  Message,
  On,
  Update,
  Ctx,
  Mention,
  Next,
} from "nestjs-telegraf";
import { Telegraf, Context } from "telegraf";
import { ClankerBotName } from "@/app.constants";
import { Logger } from "@nestjs/common";
import { CharacterService } from "@character/service/character.service";
import { Update as TelegramUpdate } from "telegraf/types";
import { TriggerService } from "@character/service/trigger.service";

@Update()
export class TalkingController {
  private readonly logger = new Logger("Character/TalkingController");

  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly characterService: CharacterService,
    private readonly triggerService: TriggerService
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

    let botWasMentioned: boolean = context
      .entities("mention")
      .some((entity) => entity.fragment === context.botInfo.username);

    botWasMentioned =
      botWasMentioned ||
      ("reply_to_message" in message &&
        message.reply_to_message?.from.id === context.botInfo.id);

    if (botWasMentioned && this.triggerService.isTriggered(1)) {
      this.logger.log("Triggered by mention");

      const response = await this.characterService.respond(context.text);
      await context.reply(response, {
        reply_parameters: {
          chat_id: context.chat.id,
          message_id: message.message_id,
          allow_sending_without_reply: false,
        },
      });

      return next();
    }

    if (this.triggerService.triggered(context.text)) {
      this.logger.log("Triggered by keyword");

      const response = await this.characterService.respond(context.text);
      await context.reply(response, {
        reply_parameters: {
          chat_id: context.chat.id,
          message_id: message.message_id,
          allow_sending_without_reply: false,
        },
      });

      return next();
    }

    return next();
  }
}
