import { Module } from "@nestjs/common";
import { CharacterController } from "./controller/character.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { CoreModule } from "@core/core.module";
import { GenAiModule } from "@genai/genai.module";
import { CharacterService } from "./service/character.service";
import { TriggerService } from "./service/trigger.service";
import { PersonService } from "./service/person.service";
import { PersonEntity, PersonEntitySchema } from "./entity/person.entity";
import { PromptService } from "./service/prompt.service";
import { ConversationService } from "./service/conversation.service";
import {
  ConversationEntity,
  ConversationEntitySchema,
} from "@roleplay/entity/conversation.entity";

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
  ],
  providers: [
    CharacterController,
    ConversationService,
    CharacterService,
    TriggerService,
    PersonService,
    PromptService,
  ],
  exports: [CharacterService],
})
export class RoleplayModule {}
