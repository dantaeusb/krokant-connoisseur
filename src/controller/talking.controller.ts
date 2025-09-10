import { InjectBot, Message, On, Update, Ctx } from "nestjs-telegraf";
import { Telegraf } from "telegraf";
import { TranslationService } from "../service/translation.service";
import { ClankerBotName } from "../app.constants";
import { Context } from "../interfaces/context.interface";
import { LanguageCheckService } from "../service/language-check.service";

@Update()
export class TalkingController {
  constructor(
    @InjectBot(ClankerBotName)
    private readonly bot: Telegraf<Context>,
    private readonly translationService: TranslationService,
    private readonly languageCheckService: LanguageCheckService
  ) {}

  @On("text")
  messageLanguageCheck(
    @Ctx() context: Context,
    @Message() message: Context
  ): Promise<void> {
    if (this.languageCheckService.checkLanguageInMessages(context)) {
      this.translationService
        .translateText(context.text)
        .then((translatedText) => {
          if (translatedText) {
            context.sendMessage(translatedText, {
              reply_parameters: {
                message_id: context.message.message_id,
                chat_id: context.chat.id,
                allow_sending_without_reply: false,
              },
            });
          }
        });
    }

    return;
  }

  @On("text")
  messageReply(
    @Ctx() context: Context,
    @Message() message: Context
  ): Promise<void> {
    return;
  }
}
