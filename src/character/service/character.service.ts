import { Injectable } from "@nestjs/common";
import { GeminiService } from "./gemini.service";

@Injectable()
export class CharacterService {
  constructor(private readonly geminiService: GeminiService) {}

  public async respond(text: string, name?: string): Promise<string> {
    let prompt = `Reply to following message:${text}`;

    if (name) {
      prompt = `You are replying to ${name}\n` + prompt;
    }

    const result = await this.geminiService.good(prompt);

    if (!result) {
      return this.fallback();
    }

    return result;
  }

  public async rephrase(text: string, name?: string): Promise<string> {
    let prompt = `Rephrase the following message: ${text}`;

    if (name) {
      prompt = `You are replying to ${name}\n` + prompt;
    }

    const result = await this.geminiService.quick(prompt);

    if (!result) {
      return this.fallback();
    }

    return result;
  }

  private async fallback(): Promise<string> {
    return "What you said is so dumb that I couldn't answer without triggering safety filters, of which I have none. Please shut up.";
  }
}
