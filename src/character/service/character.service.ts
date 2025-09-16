import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@core/service/config.service";
import { GeminiService } from "./gemini.service";
import { UserEntity } from "@core/entity/user.entity";
import { MessageService } from "@core/service/message.service";
import { Content } from "@google/genai";
import { MessageEntity } from "@core/entity/message.entity";

@Injectable()
export class CharacterService {
  private logger: Logger = new Logger(ConfigService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly messageService: MessageService
  ) {}

  public async respond(
    chatId: number,
    messageId: number,
    text: string,
    toUser?: UserEntity
  ): Promise<string> {
    const promptList: Array<Content> = [
      {
        role: "model",
        parts: [
          { text: `You are replying to ${toUser?.name ?? "unknown user"}` },
        ],
      },
    ];

    const chain = await this.messageService.getMessageChain(chatId, messageId);
    const promptThreadChain: Array<Content> = this.chainToPrompt(chain);

    if (promptThreadChain) {
      promptList.push({
        role: "user",
        parts: [{ text: `Here's the context of your conversation:\n` }],
      });

      promptList.push(...promptThreadChain);
    }

    promptList.push({
      role: "user",
      parts: [{ text: `Reply to following message: ${text}` }],
    });

    this.logger.log(promptList);

    const chatConfig = await this.configService.getConfig();

    const result = await this.geminiService.good(
      promptList,
      chatConfig.systemPrompt
    );

    if (!result) {
      return this.fallback();
    }

    return result;
  }

  public async rephrase(text: string, toUser?: UserEntity): Promise<string> {
    let prompt = `Rephrase the following message: ${text}`;

    if (toUser) {
      prompt = `You are replying to ${toUser.name}\n` + prompt;
    }

    const chatConfig = await this.configService.getConfig();

    const result = await this.geminiService.quick(
      prompt,
      chatConfig.systemPrompt
    );

    if (!result) {
      return this.fallback();
    }

    return result;
  }

  private chainToPrompt(chain: Array<MessageEntity>): Array<Content> {
    const botId = this.configService.botId;

    return chain.map((message) => {
      return {
        role: message.userId !== botId ? "user" : "model",
        parts: [{ text: message.text }],
      };
    });
  }

  private async fallback(): Promise<string> {
    return "What you said is so dumb that I couldn't answer without triggering safety filters, of which I have none. Please shut up.";
  }
}
