import { Module } from "@nestjs/common";
import { GeminiService } from "./service/gemini.service";

@Module({
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GenAiModule {}
