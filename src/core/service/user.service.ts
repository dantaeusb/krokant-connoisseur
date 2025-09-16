import { Injectable, Logger } from "@nestjs/common";
import { UserEntity } from "../entity/user.entity";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import { User } from "@telegraf/types/manage";

@Injectable()
export class UserService {
  private logger = new Logger("Core/UserService");

  constructor(
    @InjectModel(UserEntity.COLLECTION_NAME) private userEntityModel: Model<UserEntity>
  ) {}

  public async getUserByUsername(chatId: number, username: string) {
    return this.userEntityModel
      .findOne({
        chatId: chatId,
        username: username,
      })
      .exec();
  }

  public async getUser(
    chatId: number,
    userId: number,
    createIfNotExists?: User
  ): Promise<UserEntity> {
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
}
