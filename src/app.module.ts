import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ClankerBotName } from "./app.constants";
import { TelegrafModule } from "nestjs-telegraf";
import { ModerationModule } from "./moderation.module";
import { TalkingModule } from "./talking.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TelegrafModule.forRootAsync({
      botName: ClankerBotName,
      useFactory: () => ({
        token: process.env.TELEGRAM_BOT_TOKEN,
        include: [ModerationModule, TalkingModule],
      }),
    }),
    ModerationModule,
    TalkingModule,
  ],
})
export class AppModule {}
