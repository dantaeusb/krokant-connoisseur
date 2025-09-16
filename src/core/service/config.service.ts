import { Injectable, Logger } from "@nestjs/common";
import { ConfigEntity } from "../entity/config.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  public readonly botId = parseInt(process.env.TELEGRAM_BOT_ID || "0", 10);
  private readonly configCache: Map<number, ConfigEntity> = new Map();

  constructor(
    @InjectModel(ConfigEntity.COLLECTION_NAME)
    private configModel: Model<ConfigEntity>
  ) {
    void this.reloadConfig();
  }

  public async reloadConfig(chatId?: number) {
    let searchCriteria = {};

    if (chatId) {
      searchCriteria = { chatId: chatId.toString() };
      this.configCache.delete(chatId);
    } else {
      this.configCache.clear();
    }

    return await this.configModel
      .find(searchCriteria)
      .exec()
      .then((configs) => {
        configs.forEach((config) => {
          this.configCache.set(config.chatId, config);
        });
        return configs;
      })
      .catch((error) => {
        this.logger.error("Failed to reload configurations", error);
        return [] as ConfigEntity[];
      });
  }

  public async getConfig(chatId?: number) {
    if (chatId && this.configCache.has(chatId)) {
      return this.configCache.get(chatId);
    }

    const config = await this.configModel
      .findOneAndUpdate(
        { chatId: chatId },
        {},
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      )
      .exec();

    if (chatId) {
      this.configCache.set(chatId, config);
    }

    return config;
  }

  public async setYapping(chatId: number, yapping: boolean) {
    const config = await this.getConfig(chatId);

    if (config) {
      config.yapping = yapping;
      await this.configModel
        .updateOne({ chatId: chatId }, { yapping: yapping })
        .exec();
      this.configCache.set(chatId, config);
    }

    return config;
  }
}
