import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { MongooseModule } from "@nestjs/mongoose";
import { TelegrafModule } from "nestjs-telegraf";
import { CoreModule } from "@core/core.module";
import { ModerationModule } from "@moderation/moderation.module";
import { GenAiModule } from "@genai/genai.module";
import { RoleplayModule } from "@roleplay/roleplay.module";
import { BotName } from "./app.constants";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGODB_URI),
    TelegrafModule.forRootAsync({
      botName: BotName,
      useFactory: () => ({
        token: process.env.TELEGRAM_BOT_TOKEN,
        include: [ModerationModule, RoleplayModule],
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
    GenAiModule,
    RoleplayModule,
  ],
})
export class AppModule {}
