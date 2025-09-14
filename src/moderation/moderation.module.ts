import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ModerationController } from "./controller/moderation.controller";
import { ModerationService } from "./service/moderation.service";
import { LanguageCheckService } from "./service/language-check.service";
import { ProfanityCheckService } from "./service/profanity-check.service";
import { LinksCheckService } from "./service/links-check.service";
import { TranslationService } from "./service/translation.service";
import { BanEntity, BanSchema } from "./entity/ban.entity";
import { WarnEntity, WarnSchema } from "./entity/warn.entity";
import {
  LanguageWarnEntity,
  LanguageWarnSchema,
} from "./entity/language-warn.entity";
import { CoreModule } from "@core/core.module";
import { CharacterModule } from "@character/character.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BanEntity.name, schema: BanSchema }]),
    MongooseModule.forFeature([{ name: WarnEntity.name, schema: WarnSchema }]),
    MongooseModule.forFeature([
      { name: LanguageWarnEntity.name, schema: LanguageWarnSchema },
    ]),
    CoreModule,
    CharacterModule,
  ],
  providers: [
    ModerationController,
    ModerationService,
    LanguageCheckService,
    ProfanityCheckService,
    LinksCheckService,
    TranslationService,
  ],
  exports: [ModerationService, TranslationService],
})
export class ModerationModule {}
