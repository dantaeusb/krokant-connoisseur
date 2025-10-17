import { Module } from "@nestjs/common";
import { GeminiService } from "./service/gemini.service";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ChatCacheEntity,
  ChatCacheSchema,
} from "@genai/entity/chat-cache.entity";

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
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GenAiModule {}
