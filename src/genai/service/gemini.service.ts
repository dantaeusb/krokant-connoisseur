import { Injectable, Logger } from "@nestjs/common";
import {
  Candidate,
  ContentListUnion,
  GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  SafetySetting,
  Schema,
} from "@google/genai";
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

  constructor() {
    this.googleGenAI = new GoogleGenAI({
      vertexai: true,
      location: "europe-west9",
      project: process.env.GOOGLE_PROJECT_ID,
      googleAuthOptions: {
        keyFilename: "./gcp-key.json",
        projectId: process.env.GOOGLE_PROJECT_ID,
      },
    });
  }

  public async good(
    prompt: ContentListUnion,
    systemPrompt?: string,
    canGoogle = false
  ): Promise<Candidate | null> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt ?? GeminiService.FALLBACK_SYSTEM_PROMPT,
        temperature: 1.5,
        topP: 0.85,
        ...(canGoogle ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    this.resultSanityCheck(result);

    return result.candidates[0];
  }

  public async regular(
    prompt: ContentListUnion,
    systemPrompt?: string,
    canGoogle = false
  ): Promise<Candidate | null> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt ?? GeminiService.FALLBACK_SYSTEM_PROMPT,
        temperature: 1.3,
        topP: 0.9,
        ...(canGoogle ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    this.resultSanityCheck(result);

    return result.candidates[0];
  }

  public async quick(
    prompt: ContentListUnion,
    systemPrompt?: string
  ): Promise<Candidate | null> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt ?? GeminiService.FALLBACK_SYSTEM_PROMPT,
        temperature: 1.0,
        topP: 0.95,
      },
    });

    this.resultSanityCheck(result);

    return result.candidates[0];
  }

  /**
   * Cool shit: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
   * As it's probably the most important part, let's use only the best model
   *
   * @param prompt
   * @param systemPrompt
   */
  public async summarizeAndRate(
    contents: ContentListUnion,
    responseSchema: Schema,
    systemPrompt?: string
  ): Promise<Candidate> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt,
        temperature: 0.5,
        topP: 1.0,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    this.resultSanityCheck(result);

    return result.candidates[0];
  }

  public async quickRate(
    prompt: string,
    systemPrompt?: string
  ): Promise<string | null> {
    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "system",
          parts: [{ text: systemPrompt ?? "You are a helpful assistant." }],
        },
        { role: "user", parts: [{ text: prompt }] },
      ],
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        temperature: 0.0,
        topP: 1.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
        },
      },
    });

    this.resultSanityCheck(result);

    return JSON.parse(
      result.candidates[0].content.parts
        .map((part) => part.text || "")
        .join("\n") ?? null
    );
  }

  public resultSanityCheck(result: GenerateContentResponse) {
    if (result.usageMetadata.promptTokenCount > 400000) {
      this.logger.warn(
        `High token usage: ${result.usageMetadata.promptTokenCount}`
      );
    }

    //this.logger.debug(result);

    if (result.candidates.length > 0) {
      const answer =
        result.candidates[0].content.parts
          .map((part) => part.text || "")
          .join("\n") ?? null;

      this.logger.log(answer);
    }
  }
}
