import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  ChatConfigDocument,
  ChatConfigEntity,
} from "../entity/chat-config.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { Update } from "telegraf/types";
import { ContextWithChatConfig } from "@core/type/context";

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);

  public readonly botId = parseInt(process.env.TELEGRAM_BOT_ID || "0", 10);
  private readonly configCache: Map<number, ChatConfigDocument> = new Map();

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>,
    @InjectModel(ChatConfigEntity.COLLECTION_NAME)
    private configModel: Model<ChatConfigEntity>
  ) {
    void this.reloadConfig();
  }

  /**
   * @todo: [CRIT]: Fix, the middleware fires AFTER events, not before
   */
  onModuleInit() {
    this.logger.debug(
      "ConfigService initialized, setting up middleware for chat configurations."
    );

    this.bot.use(async (context: ContextWithChatConfig<Update>, next) => {
      const chatId = context.chat.id;

      context.chatConfig = await this.getConfig(chatId);

      await next();
    });
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
        return [] as ChatConfigEntity[];
      });
  }

  public async getConfig(chatId = 0): Promise<ChatConfigDocument> {
    if (this.configCache.has(chatId)) {
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

  public async getAllChatIds(): Promise<number[]> {
    const configs = await this.configModel
      .find({}, { chatId: 1, _id: 0 })
      .exec();

    return configs.map((config) => config.chatId);
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

  public async setDebugging(chatId: number, debug: boolean) {
    const config = await this.getConfig(chatId);

    if (config) {
      config.debugMode = debug;
      await this.configModel
        .updateOne({ chatId: chatId }, { debugMode: debug })
        .exec();
      this.configCache.set(chatId, config);
    }

    return config;
  }
}
