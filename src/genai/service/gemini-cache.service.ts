import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ChatCacheEntity } from "@genai/entity/chat-cache.entity";
import { Model } from "mongoose";
import { GeminiService } from "@genai/service/gemini.service";

@Injectable()
export class GeminiCacheService {
  private readonly logger = new Logger("GenAi/GeminiCacheService");

  constructor(
    @InjectModel(ChatCacheEntity.COLLECTION_NAME)
    private readonly chatCacheModel: Model<ChatCacheEntity>,
    private readonly geminiService: GeminiService,
  ) {}

  public cacheChat(
    chatId: number,
    content: string,
  ): Promise<ChatCacheEntity> {
    this.logger.debug(`Caching chat data for chatId=${chatId}`);

    const caches = this.geminiService.getCaches()

    const filter = { chatId };
    const update = {
      chatId,
      content,
      updatedAt: new Date(),
    };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };

    return this.chatCacheModel.findOneAndUpdate(filter, update, options).exec();
  }
}