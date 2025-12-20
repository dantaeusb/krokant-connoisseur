import { Injectable, Logger } from "@nestjs/common";
import {
  Candidate,
  Content,
  ContentListUnion,
  GenerateContentConfig,
  Schema,
  ToolListUnion,
} from "@google/genai";
import { ModelQualityType } from "@genai/types/model-quality.type";
import { ContextWindowType } from "@roleplay/types/context-window.type";
import { ChatCacheEntity } from "@genai/entity/chat-cache.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ModelCallableToolFunction } from "@genai/types/tool.type";
import { zodToVertexSchema } from "@techery/zod-to-vertex-schema";
import stringHash from "string-hash";
import * as assert from "node:assert";
import { GeminiService } from "@genai/service/gemini.service";

@Injectable()
export class GenerationService {
  private static CACHES_TTL: Record<ModelQualityType, number> = {
    advanced: 60 * 30, // 30 minutes
    regular: 60 * 60 * 4,
    low: 0,
  };
  private static MAX_CACHES_PER_CHAT = 2;

  private readonly logger = new Logger("GenAi/GenerationService");

  constructor(
    private readonly geminiService: GeminiService,
    @InjectModel(ChatCacheEntity.COLLECTION_NAME)
    private readonly chatCacheModel: Model<ChatCacheEntity>
  ) {}

  /**
   *
   * @param chatId Scope chat ID
   * @param quality Model quality
   * @param systemInstruction System instruction for the model
   * @param contents Current conversation contents
   * @param toolFunctionGroups Tool functions to be made available
   * @param cacheName Optional cache name to use
   * @param getCacheContents Function to get cache contents if needed – must be provided if cacheName is provided
   * @returns Generated candidate or null if generation failed
   */
  public async generate(
    chatId: number,
    quality: ModelQualityType,
    systemInstruction: string,
    contents: Array<Content>,
    toolFunctionGroups?: Array<Array<ModelCallableToolFunction>>,
    cacheName?: string,
    getCacheContents?: () => Promise<ContentListUnion>
  ): Promise<Candidate | null> {
    assert(
      !cacheName || getCacheContents,
      "getCacheContents must be provided if cacheName is provided"
    );

    const toolNames = toolFunctionGroups.flat().reduce((acc, toolFunction) => {
      acc.push(toolFunction.name);
      return acc;
    }, [] as string[]);

    let cachedContent: string | undefined;
    const tools = this.getTools(toolFunctionGroups || []);

    if (cacheName) {
      const cache = await this.getChatCache(
        chatId,
        quality,
        cacheName,
        toolFunctionGroups
      );

      cachedContent = cache.displayName;
    }

    let hasFunctionCalls = false;
    let result: Candidate | null = null;

    do {
      result = await this.geminiService.generate(
        quality,
        systemInstruction,
        contents,
        tools,
        cachedContent
      );

      if (!result) {
        return null;
      }

      // Only request for one candidate at a time

      contents.push(result.content);

      for (const part of result.content.parts) {
        // @todo: [LOW] Handle calls as promises and await all at once
        if ("functionCall" in part) {
          hasFunctionCalls = true;

          try {
            const [toolCode, functionCode] = part.functionCall.name.split(".");
            const toolService = toolFunctionGroups
              ?.flat()
              .find((ts) => ts.code === toolCode);

            assert(toolNames.includes(toolCode), `Tool ${toolCode} not found`);

            const toolOutput = await toolService[functionCode](
              part.functionCall.args
            );

            contents.push({
              role: "user",
              parts: [
                {
                  functionResponse: {
                    response: {
                      id: part.functionCall.id,
                      name: part.functionCall.name,
                      output: toolOutput,
                    },
                  },
                },
              ],
            });
          } catch (e) {
            this.logger.error(e);

            contents.push({
              role: "user",
              parts: [
                {
                  text: `Error executing function call`,
                },
              ],
            });
          }
        }
      }
    } while (hasFunctionCalls);

    return result;
  }

  public getTools(
    toolFunctionsGroups: Array<Array<ModelCallableToolFunction>>
  ): ToolListUnion {
    const toolList: ToolListUnion = [];

    for (const toolFunctionGroup of toolFunctionsGroups) {
      if (toolFunctionGroup[0].code === "google_search") {
        toolList.push({ googleSearch: {} });
        continue;
      }

      toolList.push({
        functionDeclarations: toolFunctionGroup.map((toolFunction) => ({
          name: toolFunction.code,
          behavior: toolFunction.behavior,
          description: toolFunction.description,
          parameters: zodToVertexSchema(
            toolFunction.arguments
          ) as unknown as Schema,
        })),
      });
    }

    return toolList;
  }

  public async getOrCreateChatCache(
    chatId: number,
    quality: ModelQualityType,
    systemInstruction: string,
    toolFunctionGroups?: Array<Array<ModelCallableToolFunction>>,
    cacheName: string,
    messageRange?: [number, number]
  ): Promise<ChatCacheEntity | null> {
    let cache = await this.getChatCache(
      chatId,
      quality,
      cacheName,
      toolFunctionGroups
    );

    if (!cache) {
      const contents = await getCacheContents();

      cache = await this.createChatCache(
        chatId,
        quality,
        ContextWindowType.DEFAULT,
        "Cache data",
        contents,
        undefined,
        false
      );
    }

    return cache;
  }
  /**
   *
   * @param chatId
   * @param quality
   * @param cacheName
   * @param toolFunctionGroups
   */
  public async getChatCache(
    chatId: number,
    quality: ModelQualityType,
    cacheName: string,
    toolFunctionGroups?: Array<Array<ModelCallableToolFunction>>
  ): Promise<ChatCacheEntity | null> {
    const displayName = this.getCacheDisplayName(
      chatId,
      quality,
      cacheName,
      toolFunctionGroups
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    return this.chatCacheModel.findOne({
      chatId,
      displayName,
      deleted: { $ne: true },
      expiresAt: { $gt: expiresAt },
    });
  }

  public async deleteChatCache(
    chatId: number,
    type: ModelQualityType,
    name: string,
    toolFunctionGroups?: Array<Array<ModelCallableToolFunction>>
  ): Promise<void> {
    const displayName = this.getCacheDisplayName(
      chatId,
      type,
      name,
      toolFunctionGroups
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const cacheTracker = await this.chatCacheModel.findOne({
      chatId,
      displayName,
      deleted: { $ne: true },
      expiresAt: { $gt: expiresAt },
    });

    if (cacheTracker) {
      this.logger.debug(
        `Deleting chat cache for chatId=${chatId}, type=${type}`
      );

      await this.geminiService.getCaches().delete({
        name: cacheTracker.name,
      });

      await this.chatCacheModel.updateOne(
        { _id: cacheTracker._id },
        { $set: { deleted: true } }
      );
    }
  }

  /**
   * Create a cache for the given chat data.
   * @param chatId
   * @param quality
   * @param contents
   * @param systemInstruction
   * @param toolFunctionGroups
   * @param cacheName
   * @param messageRange - [startMessageId, endMessageId]
   */
  public async createChatCache(
    chatId: number,
    quality: ModelQualityType,
    systemInstruction: string,
    contents: Array<Content>,
    toolFunctionGroups?: Array<Array<ModelCallableToolFunction>>,
    cacheName: string,
    messageRange?: [number, number]
  ): Promise<ChatCacheEntity | null> {
    if (GenerationService.CACHES_TTL[quality] === 0) {
      return null;
    }

    this.logger.debug(`Caching chat data for chatId=${chatId}`);

    this.geminiService.logPromptForDebug(contents, systemInstruction);

    const tools = this.getTools(toolFunctionGroups || []);

    const cache = await this.geminiService.getCaches().create({
      model: this.geminiService.getModelByQuality(quality),
      config: {
        contents,
        systemInstruction,
        displayName: this.getCacheDisplayName(
          chatId,
          quality,
          cacheName,
          toolFunctionGroups
        ),
        ttl: `${GenerationService.CACHES_TTL[quality]}s`,
        tools,
      },
    });

    cache.usageMetadata.totalTokenCount;

    return await this.chatCacheModel.create({
      chatId,
      name: cache.name,
      displayName: cache.displayName,
      model: cache.model,
      expiresAt: new Date(cache.expireTime),
      ...(messageRange && {
        startMessageId: messageRange[0],
        endMessageId: messageRange[1],
      }),
    });
  }

  /*
   * Utilities
   */

  private getCacheDisplayName(
    chatId: number,
    quality: ModelQualityType,
    name: string,
    toolFunctionGroups?: Array<Array<ModelCallableToolFunction>>
  ): string {
    let toolSuffix = "untooled";

    if (toolFunctionGroups && toolFunctionGroups.length > 0) {
      const toolNames = toolFunctionGroups
        .flat()
        .map((toolFunction) => toolFunction.name)
        .sort()
        .join("_");

      toolSuffix = `tooled_${Buffer.from(
        stringHash(toolNames).toString()
      ).toString("base64url")}`;
    }

    return `ChatCache_${chatId}_${quality}_${name}_${toolSuffix}`;
  }
}
