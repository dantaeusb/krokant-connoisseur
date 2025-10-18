import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ChatCacheEntity } from "@genai/entity/chat-cache.entity";
import { Model } from "mongoose";
import { GeminiService } from "@genai/service/gemini.service";
import { ContentListUnion } from "@google/genai";
import { ModelQualityType } from "@genai/types/model-quality.type";

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
    type: ModelQualityType
  ): Promise<ChatCacheEntity | null> {
    const displayName = this.getDisplayName(chatId, type);
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
    type: ModelQualityType
  ): Promise<void> {
    const displayName = this.getDisplayName(chatId, type);

    const cacheTracker = await this.chatCacheModel.findOne({
      chatId,
      displayName,
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
   * @param type
   * @param systemPrompt
   * @param contents
   * @param messageRange - [startMessageId, endMessageId]
   */
  public async createChatCache(
    chatId: number,
    type: ModelQualityType,
    systemPrompt: string,
    contents: ContentListUnion,
    messageRange: [number, number]
  ): Promise<ChatCacheEntity> {
    this.logger.debug(`Caching chat data for chatId=${chatId}`);

    const cache = await this.geminiService.getCaches().create({
      model: "gemini-2.5-flash",
      config: {
        contents,
        systemInstruction: systemPrompt,
        displayName: this.getDisplayName(chatId, type),
        ttl: `${GeminiCacheService.CACHE_TTL_SECONDS}s`,
      },
    });

    const cacheTracker = await this.chatCacheModel.create({
      chatId,
      name: cache.name,
      displayName: cache.displayName,
      model: cache.model,
      expiresAt: new Date(cache.expireTime),
      startMessageId: messageRange[0],
      endMessageId: messageRange[1],
    });

    return cacheTracker;
  }

  private getDisplayName(chatId: number, type: ModelQualityType): string {
    return `ChatCache_${chatId}_${type}`;
  }
}
