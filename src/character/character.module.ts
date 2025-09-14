import { Module } from "@nestjs/common";
import { TalkingController } from "./controller/talking.controller";
import { CoreModule } from "@core/core.module";
import { GeminiService } from "@character/service/gemini.service";
import { CharacterService } from "@character/service/character.service";
import { TriggerService } from "@character/service/trigger.service";

@Module({
  imports: [CoreModule],
  providers: [TalkingController, GeminiService, CharacterService, TriggerService],
  exports: [CharacterService],
})
export class CharacterModule {}
