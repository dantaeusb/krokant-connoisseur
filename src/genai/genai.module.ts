import { Module } from "@nestjs/common";
import { GeminiService } from "./service/gemini.service";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ChatCacheEntity,
  ChatCacheSchema,
} from "@genai/entity/chat-cache.entity";
import { GeminiCacheService } from "@genai/service/gemini-cache.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatCacheEntity.COLLECTION_NAME, schema: ChatCacheSchema },
      {
        name: ChatCacheEntity.COLLECTION_NAME,
        schema: ChatCacheSchema,
      },
    ]),
  ],
  providers: [GeminiService, GeminiCacheService],
  exports: [GeminiService, GeminiCacheService],
})
export class GenAiModule {}
