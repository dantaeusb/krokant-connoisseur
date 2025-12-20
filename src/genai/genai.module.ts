import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CoreModule } from "@core/core.module";
import { ChatCacheEntity, ChatCacheSchema } from "./entity/chat-cache.entity";
import { BatchService } from "./service/batch.service";
import {
  ChatBatchEntity,
  ChatBatchSchema,
} from "@genai/entity/chat-batch.entity";
import { GenerationService } from "@genai/service/generation.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatCacheEntity.COLLECTION_NAME, schema: ChatCacheSchema },
      {
        name: ChatCacheEntity.COLLECTION_NAME,
        schema: ChatCacheSchema,
      },
      {
        name: ChatBatchEntity.COLLECTION_NAME,
        schema: ChatBatchSchema,
      },
    ]),
    CoreModule,
  ],
  providers: [GenerationService, BatchService],
  exports: [GenerationService, BatchService],
})
export class GenAiModule {}
