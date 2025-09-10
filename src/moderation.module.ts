import { Module } from "@nestjs/common";
import { ModerationController } from "./controller/moderation.controller";
import { ModerationService } from "./service/moderation.service";

@Module({
  providers: [ModerationController, ModerationService],
})
export class ModerationModule {}
