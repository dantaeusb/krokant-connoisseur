import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { UserDocument, UserEntity } from "../entity/user.entity";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import { User, UserFromGetMe } from "@telegraf/types/manage";
import { MessageDocument } from "../entity/message.entity";
import { ConfigService } from "./config.service";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";

@Injectable()
export class UserService implements OnModuleInit {
  private logger = new Logger("Core/UserService");

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>,
    @InjectModel(UserEntity.COLLECTION_NAME)
    private userEntityModel: Model<UserEntity>,
    private configService: ConfigService
  ) {}

  onModuleInit() {
    this.ensureSelf()
      .then(() => this.logger.log("Ensured bot user exists in all chats."))
      .catch((error) =>
        this.logger.error("Error ensuring bot user exists in all chats:", error)
      );
  }

  /**
   * @todo: [MED]: Called on bot start to ensure bot user exists in all chats
   * @param chatId
   * @param bot
   */
  public async ensureSelf(
    chatId?: number,
    bot?: UserFromGetMe
  ): Promise<UserDocument> {
    if (!bot) {
      bot = await this.bot.telegram.getMe();
    }

    if (chatId === undefined) {
      this.logger.debug("No chatId provided, ensuring bot user for all chats.");

      let chatIds = await this.configService.getAllChatIds();
      chatIds = chatIds.filter((id) => id !== undefined && id !== null);

      await Promise.all(
        chatIds.map(async (chatId) => {
          await this.ensureSelf(chatId, bot);
        })
      );

      return;
    }

    let user = await this.getUser(chatId, bot.id);

    if (!user) {
      this.logger.log(
        `Bot user not found in DB for chat ${chatId}, creating new entry.`
      );

      user = await this.userEntityModel.create({
        chatId: chatId,
        userId: bot.id,
        username: bot.username,
        name: `${bot.first_name} ${bot.last_name ?? ""}`.trim(),
      });
    }

    return user;
  }

  public async getParticipants(
    chatId: number,
    messages: Array<MessageDocument>
  ): Promise<Array<UserDocument>> {
    const participantIds = messages.reduce((ids, currentMessage) => {
      if (!ids.includes(currentMessage.userId)) {
        ids.push(currentMessage.userId);
      }

      return ids;
    }, [] as Array<number>);

    return await this.getUsers(chatId, participantIds);
  }

  public getSafeUniqueIdentifier(
    user?: Pick<UserEntity, "userId" | "username">
  ): string {
    if (!user) {
      return "Unknown";
    }

    if (user.username) {
      return `@${user.username}`;
    }

    return `ID:${user.userId}`;
  }

  public getSafeUserName(
    user?: Pick<UserEntity, "userId" | "name" | "username">
  ): string {
    if (!user) {
      return "Unknown";
    }

    if (user.name) {
      return user.name;
    }

    if (user.username) {
      return `@${user.username}`;
    }

    return `ID:${user.userId}`;
  }

  public async getUser(
    chatId: number,
    userId: number,
    createIfNotExists?: User
  ): Promise<UserDocument> {
    const user = await this.userEntityModel
      .findOne({
        chatId: chatId.toString(),
        userId: userId.toString(),
      })
      .exec();

    if (!user && createIfNotExists) {
      this.logger.log(`Creating new user for ${userId} at chat ${chatId}`);

      const newUser = new this.userEntityModel({
        chatId: chatId.toString(),
        userId: userId.toString(),
        username: createIfNotExists.username,
        name: `${createIfNotExists.first_name} ${
          createIfNotExists.last_name || ""
        }`.trim(),
      });
      await newUser.save();
      return newUser;
    }

    return user;
  }

  public async getUsers(
    chatId: number,
    userIds: number[]
  ): Promise<Array<UserDocument>> {
    return this.userEntityModel
      .find({
        chatId: chatId,
        userId: { $in: userIds },
      })
      .exec();
  }

  public async getAllUsersInChat(chatId: number): Promise<UserDocument[]> {
    return this.userEntityModel
      .find({
        chatId: chatId,
      })
      .exec();
  }

  public async getUserByUsername(chatId: number, username: string) {
    return this.userEntityModel
      .findOne({
        chatId: chatId,
        username: username,
      })
      .exec();
  }

  public async setIgnore(chatId: number, userId: number, ignore: boolean) {
    return this.userEntityModel
      .updateOne({ chatId: chatId, userId: userId }, { ignore: ignore })
      .exec();
  }
}
