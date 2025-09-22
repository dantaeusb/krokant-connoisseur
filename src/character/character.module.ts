import { Module } from "@nestjs/common";
import { CharacterController } from "./controller/character.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { CoreModule } from "@core/core.module";
import { GeminiService } from "./service/gemini.service";
import { CharacterService } from "./service/character.service";
import { TriggerService } from "./service/trigger.service";
import { PersonService } from "./service/person.service";
import { PersonEntity, PersonEntitySchema } from "./entity/person.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonEntity.COLLECTION_NAME, schema: PersonEntitySchema },
    ]),
    CoreModule,
  ],
  providers: [
    CharacterController,
    GeminiService,
    CharacterService,
    TriggerService,
    PersonService,
  ],
  exports: [CharacterService],
})
export class CharacterModule {}
