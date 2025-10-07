import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ModerationController } from "./controller/moderation.controller";
import { ModerationService } from "./service/moderation.service";
import { LanguageCheckService } from "./service/language-check.service";
import { ProfanityCheckService } from "./service/profanity-check.service";
import { LinksCheckService } from "./service/links-check.service";
import { TranslationService } from "./service/translation.service";
import { BanSchema } from "./entity/ban.entity";
import { WarnSchema } from "./entity/warn.entity";
import { LanguageWarnSchema } from "./entity/language-warn.entity";
import { CoreModule } from "@core/core.module";
import { RoleplayModule } from "@roleplay/roleplay.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "ban", schema: BanSchema }]),
    MongooseModule.forFeature([{ name: "warn", schema: WarnSchema }]),
    MongooseModule.forFeature([
      { name: "language_warn", schema: LanguageWarnSchema },
    ]),
    CoreModule,
    forwardRef(() => RoleplayModule),
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
