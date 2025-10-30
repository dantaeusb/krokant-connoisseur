import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ChatCacheEntity } from "@genai/entity/chat-cache.entity";
import { Model } from "mongoose";
import { GeminiService } from "@genai/service/gemini.service";
import { Content, ContentListUnion, Part } from "@google/genai";
import { ModelQualityType } from "@genai/types/model-quality.type";
import { ContextWindowType } from "@roleplay/types/context-window.type";

@Injectable()
export class GeminiCacheService {
  private static CACHE_TTL_SECONDS = 60 * 60 * 7;

  private readonly logger = new Logger("GenAi/GeminiCacheService");

  constructor(
    @InjectModel(ChatCacheEntity.COLLECTION_NAME)
    private readonly chatCacheModel: Model<ChatCacheEntity>,
    private readonly geminiService: GeminiService
  ) {}

  public async getChatCache(
    chatId: number,
    type: ModelQualityType,
    contextWindow: ContextWindowType = "extended"
  ): Promise<ChatCacheEntity | null> {
    const displayName = this.getDisplayName(chatId, type, contextWindow);
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
    contextWindow: ContextWindowType = "extended"
  ): Promise<void> {
    const displayName = this.getDisplayName(chatId, type, contextWindow);
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
   * @param contextWindow
   * @param systemInstruction
   * @param contents
   * @param messageRange - [startMessageId, endMessageId]
   * @param canGoogle
   */
  public async createChatCache(
    chatId: number,
    quality: ModelQualityType,
    contextWindow: ContextWindowType,
    systemInstruction: string,
    contents: ContentListUnion,
    messageRange?: [number, number],
    canGoogle = false
  ): Promise<ChatCacheEntity> {
    this.logger.debug(`Caching chat data for chatId=${chatId}`);

    canGoogle = canGoogle && this.geminiService.canGoogleSearch(quality);

    this.logPromptForDebug(contents, systemInstruction);

    const cache = await this.geminiService.getCaches().create({
      model: this.geminiService.getModelByQuality(quality),
      config: {
        contents,
        systemInstruction,
        displayName: this.getDisplayName(chatId, quality, contextWindow),
        ttl: `${GeminiCacheService.CACHE_TTL_SECONDS}s`,
        ...(canGoogle ? { tools: [{ googleSearch: {} }] } : {}),
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

  private getDisplayName(
    chatId: number,
    type: ModelQualityType,
    contextWindow: ContextWindowType
  ): string {
    return `ChatCache_${chatId}_${type}_${contextWindow}`;
  }

  /**
   * @todo: [MED]: Create utility service to deduplicate this code
   * @param prompt
   * @param systemInstruction
   * @private
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
}
