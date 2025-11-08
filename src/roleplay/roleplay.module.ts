import { forwardRef, Module } from "@nestjs/common";
import { CharacterController } from "./controller/character.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { CoreModule } from "@core/core.module";
import { GenAiModule } from "@genai/genai.module";
import {
  ConversationEntity,
  ConversationEntitySchema,
} from "./entity/conversation.entity";
import { ModerationModule } from "@moderation/moderation.module";
import { CharacterService } from "./service/character.service";
import { TriggerService } from "./service/trigger.service";
import { PersonService } from "./service/person.service";
import { PersonEntity, PersonEntitySchema } from "./entity/person.entity";
import { PromptService } from "./service/prompt.service";
import { ConversationService } from "./service/conversation.service";
import { AnswerStrategyService } from "./service/answer-strategy.service";
import { ImageDescriptionService } from "./service/image-description.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonEntity.COLLECTION_NAME, schema: PersonEntitySchema },
      {
        name: ConversationEntity.COLLECTION_NAME,
        schema: ConversationEntitySchema,
      },
    ]),
    CoreModule,
    GenAiModule,
    forwardRef(() => ModerationModule),
  ],
  providers: [
    AnswerStrategyService,
    CharacterController,
    ConversationService,
    CharacterService,
    TriggerService,
    PersonService,
    PromptService,
    ImageDescriptionService,
  ],
  exports: [CharacterService, ImageDescriptionService],
})
export class RoleplayModule {}
