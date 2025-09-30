import { Injectable, Logger } from "@nestjs/common";
import { UserDocument, UserEntity } from "../entity/user.entity";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import { User } from "@telegraf/types/manage";
import { MessageDocument } from "@core/entity/message.entity";

@Injectable()
export class UserService {
  private logger = new Logger("Core/UserService");

  constructor(
    @InjectModel(UserEntity.COLLECTION_NAME)
    private userEntityModel: Model<UserEntity>
  ) {}

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
