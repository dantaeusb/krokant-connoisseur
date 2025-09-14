import { Injectable, Logger } from "@nestjs/common";
import { UserEntity } from "../entity/user.entity";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";

@Injectable()
export class UserService {
  private logger = new Logger("Core/UserService");

  constructor(
    @InjectModel(UserEntity.name) private userEntityModel: Model<UserEntity>
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
    createIfNotExists = true
  ): Promise<UserEntity> {
    const user = this.userEntityModel.findOne({
      chatId: chatId.toString(),
      userId: userId.toString(),
    });

    if (!user && createIfNotExists) {
      const newUser = new this.userEntityModel({
        chatId: chatId.toString(),
        userId: userId.toString(),
      });
      await newUser.save();
      return newUser;
    }

    return user;
  }
}
