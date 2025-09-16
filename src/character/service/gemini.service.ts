import { Injectable, Logger } from "@nestjs/common";
import {
  ContentListUnion,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  SafetySetting,
} from "@google/genai";
import { ConfigService } from "@core/service/config.service";
import * as process from "node:process";

@Injectable()
export class GeminiService {
  private static FALLBACK_SYSTEM_PROMPT =
    "You are a friendly and helpful assistant.";

  private readonly logger = new Logger(GeminiService.name);

  private readonly googleGenAI: GoogleGenAI;
  private readonly safetySettings: Array<SafetySetting> = [
    {
      category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.OFF,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.OFF,
    },
    {
      category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  constructor(private readonly configService: ConfigService) {
    this.googleGenAI = new GoogleGenAI({
      vertexai: true,
      //location: "europe-west9",
      apiKey: process.env.GOOGLE_API_KEY,
      /*googleAuthOptions: {
        keyFilename: "./gcp-key.json",
        projectId: process.env.GOOGLE_PROJECT_ID,
      },*/
    });
  }

  public async good(
    prompt: ContentListUnion,
    systemPrompt?: string
  ): Promise<string | null> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt ?? GeminiService.FALLBACK_SYSTEM_PROMPT,
      },
    });

    this.logger.log(result.candidates);

    return result.text ?? null;
  }

  public async quick(
    prompt: ContentListUnion,
    systemPrompt?: string
  ): Promise<string | null> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt ?? GeminiService.FALLBACK_SYSTEM_PROMPT,
      },
    });

    this.logger.log(result.candidates);

    return (
      result.candidates[0].content.parts
        .map((part) => part.text || "")
        .join("\n") ?? null
    );
  }
}
