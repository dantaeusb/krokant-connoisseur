import { Module } from "@nestjs/common";
import { TalkingController } from "./controller/talking.controller";
import { TranslationService } from "./service/translation.service";
import { LanguageCheckService } from "./service/language-check.service";
import { ModerationService } from "./service/moderation.service";

@Module({
  providers: [
    TalkingController,
    LanguageCheckService,
    TranslationService,
    ModerationService,
  ],
})
export class TalkingModule {}
