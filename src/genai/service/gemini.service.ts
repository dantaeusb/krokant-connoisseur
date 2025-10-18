import { Injectable, Logger } from "@nestjs/common";
import {
  CachedContent,
  Caches,
  Candidate,
  Content,
  ContentListUnion,
  GenerateContentConfig,
  GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Models,
  Part,
  SafetySetting,
  Schema,
  Type,
} from "@google/genai";
import * as process from "node:process";
import { ModelQualityType } from "@genai/types/model-quality.type";

@Injectable()
export class GeminiService {
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

  private readonly qualityModelSettings: Record<
    ModelQualityType,
    { model: string; temperature: number; topP: number; canGoogle?: boolean }
  > = {
    advanced: {
      model: "gemini-2.5-pro",
      temperature: 1.5,
      topP: 0.85,
      canGoogle: true,
    },
    regular: {
      model: "gemini-2.5-flash",
      temperature: 1.3,
      topP: 0.9,
      canGoogle: true,
    },
    low: { model: "gemini-2.5-flash-lite", temperature: 1.0, topP: 0.95 },
  };

  constructor() {
    this.googleGenAI = new GoogleGenAI({
      vertexai: true,
      location: "europe-west4",
      project: process.env.GOOGLE_PROJECT_ID,
      googleAuthOptions: {
        keyFilename: "./gcp-key.json",
        projectId: process.env.GOOGLE_PROJECT_ID,
      },
    });
  }

  public getModels(): Models {
    return this.googleGenAI.models;
  }

  public getCaches(): Caches {
    return this.googleGenAI.caches;
  }

  /*
   * Content generation on-demand with different quality levels
   */

  public async generate(
    quality: ModelQualityType,
    contents: ContentListUnion,
    systemInstruction: string,
    canGoogle = false,
    cacheName?: string
  ): Promise<Candidate | null> {
    this.logPromptForDebug(contents, systemInstruction);

    const config: GenerateContentConfig = {
      candidateCount: 1,
      safetySettings: this.safetySettings,
      temperature: this.qualityModelSettings[quality].temperature,
      topP: this.qualityModelSettings[quality].topP,
    };

    canGoogle = canGoogle && this.canGoogleSearch(quality);

    if (cacheName) {
      this.logger.debug(`Using cache ${cacheName}`);
      config.cachedContent = cacheName;
    } else {
      config.systemInstruction = systemInstruction;

      if (canGoogle) {
        this.logger.debug(`Enabling Google Search tool`);
        config.tools = [{ googleSearch: {} }];
      }
    }

    const result = await this.googleGenAI.models.generateContent({
      model: this.qualityModelSettings[quality].model,
      contents,
      config,
    });

    this.resultSanityCheck(result);

    return result.candidates[0];
  }

  /*
   * Summarization & Rating – using structured output
   */

  /**
   * Cool shit: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
   * As it's probably the most important part, let's use only the best mode.
   *
   * @param prompt
   * @param systemInstruction
   */
  public async summarizeAndRate(
    contents: ContentListUnion,
    responseSchema: Schema,
    systemInstruction?: string
  ): Promise<Candidate> {
    this.logPromptForDebug(contents, systemInstruction);

    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction,
        temperature: 0.5,
        topP: 1.0,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    this.resultSanityCheck(result);

    return result.candidates[0];
  }

  public async quickClassify(
    contents: ContentListUnion,
    enumValues: Array<string>,
    description: string,
    systemInstruction: string
  ): Promise<string | null> {
    this.logPromptForDebug(contents, systemInstruction);

    const result = await this.googleGenAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction,
        temperature: 0.0,
        topP: 1.0,
        responseMimeType: "text/x.enum",
        responseSchema: {
          type: Type.STRING,
          enum: enumValues,
          description: description,
        },
      },
    });

    this.resultSanityCheck(result);

    return (
      result.candidates[0].content.parts
        .map((part) => part.text || "")
        .join("\n") ?? null
    );
  }

  /*
   * Batch
   */

  public async batchGood(
    prompts: Array<ContentListUnion>,
    systemPrompt?: string
  ) {
    /*const result = await this.googleGenAI.batches.create({
      model: "gemini-2.5-pro",
      batchContents: prompts,
      config: {
        candidateCount: 1,
        safetySettings: this.safetySettings,
        systemInstruction: systemPrompt ?? GeminiService.FALLBACK_SYSTEM_PROMPT,
        temperature: 1.5,
        topP: 0.85,
      },
    });

    result.results.forEach((res) => this.resultSanityCheck(res));

    return result.results.map((res) => res.candidates[0]);*/
  }

  /*
   * Utilities
   */

  private logPromptForDebug(
    prompt: ContentListUnion,
    systemInstruction?: string
  ) {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const formatPart = (part: Part): string => {
      if (part.text) {
        if (part.text.length > 1000) {
          return part.text.slice(0, 1000) + "... [truncated]";
        }

        return part.text;
      }
      if (part.inlineData) {
        return `[Inline data: ${part.inlineData.mimeType}]`;
      }
      if (part.fileData) {
        return `[File data: ${part.fileData.mimeType}]`;
      }
      return "[Unknown part]";
    };

    const formatContent = (content: Content): string =>
      content.parts.map(formatPart).join("\n");

    const promptText = Array.isArray(prompt)
      ? prompt.map(formatContent).join("\n---\n")
      : prompt;

    const logMessage = `
=====================
[System Instruction]:
${systemInstruction}
---------------------
[User Prompt]:
${promptText}
=====================
`;
    this.logger.debug(logMessage);
  }

  public async getTokenCount(
    quality: ModelQualityType,
    contents: ContentListUnion
  ): Promise<number> {
    const response = await this.googleGenAI.models.countTokens({
      model: this.qualityModelSettings[quality].model,
      contents,
    });

    return response.totalTokens;
  }

  public getModelByQuality(quality: ModelQualityType): string {
    return this.qualityModelSettings[quality].model;
  }

  public canGoogleSearch(quality: ModelQualityType): boolean {
    return !!this.qualityModelSettings[quality].canGoogle;
  }

  public resultSanityCheck(result: GenerateContentResponse) {
    if (result.usageMetadata.promptTokenCount > 400000) {
      this.logger.warn(
        `High token usage: ${result.usageMetadata.promptTokenCount}`
      );
    }

    //this.logger.debug(result);

    if (!result.candidates) {
      this.logger.warn("No candidates in the result");
    } else if (result.candidates.length > 0) {
      const answer =
        result.candidates[0].content.parts
          .map((part) => part.text || "")
          .join("\n") ?? null;

      this.logger.log(answer);
    }
  }
}
