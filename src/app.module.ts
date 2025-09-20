import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { MongooseModule } from "@nestjs/mongoose";
import { TelegrafModule } from "nestjs-telegraf";
import { ModerationModule } from "./moderation/moderation.module";
import { CharacterModule } from "./character/character.module";
import { CoreModule } from "./core/core.module";
import { ClankerBotName } from "./app.constants";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGODB_URI),
    TelegrafModule.forRootAsync({
      botName: ClankerBotName,
      useFactory: () => ({
        token: process.env.TELEGRAM_BOT_TOKEN,
        include: [ModerationModule, CharacterModule],
        launchOptions: {
          allowedUpdates: [
            "message",
            "edited_message",
            "message_reaction",
            "message_reaction_count",
            "inline_query",
            "chosen_inline_result",
            "poll",
            "poll_answer",
            "chat_join_request",
            "callback_query",
          ],
        },
      }),
    }),
    CoreModule,
    ModerationModule,
    CharacterModule,
  ],
})
export class AppModule {}
