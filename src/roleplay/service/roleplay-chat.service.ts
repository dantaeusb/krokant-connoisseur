import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@core/service/config.service";
import { GeminiService } from "@genai/service/gemini.service";
import { PromptService } from "@roleplay/service/prompt.service";
import { ConversationService } from "@roleplay/service/conversation.service";

@Injectable()
export class RoleplayChatService {
  private logger = new Logger("Roleplay/RoleplayChatService");

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly conversationService: ConversationService,
    private readonly promptService: PromptService
  ) {

  }
}