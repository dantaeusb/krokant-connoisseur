import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CoreModule } from "@core/core.module";
import { GeminiService } from "./service/gemini.service";
import { ChatCacheEntity, ChatCacheSchema } from "./entity/chat-cache.entity";
import { GeminiCacheService } from "./service/gemini-cache.service";
import { BatchService } from "./service/batch.service";
import {
  ChatBatchEntity,
  ChatBatchSchema,
} from "@genai/entity/chat-batch.entity";

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
  providers: [GeminiService, GeminiCacheService, BatchService],
  exports: [GeminiService, GeminiCacheService, BatchService],
})
export class GenAiModule {}
