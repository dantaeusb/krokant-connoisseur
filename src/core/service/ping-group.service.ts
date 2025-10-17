import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "./config.service";
import { ChatConfigEntity } from "../entity/chat-config.entity";
import { PingGroupEntity } from "../entity/config/ping-group.entity";

@Injectable()
export class PingGroupService {
  private static GROUP_HANDLE_REGEX = /!([a-zA-Z0-9_]+)/g;

  private readonly logger = new Logger("Core/PingGroupService");

  constructor(
    @InjectModel(ChatConfigEntity.COLLECTION_NAME)
    private configModel: Model<ChatConfigEntity>,
    private readonly configService: ConfigService
  ) {}

  public async findGroupPingHandle(
    chatId: number,
    messageText: string
  ): Promise<PingGroupEntity | null> {
    const handle = PingGroupService.GROUP_HANDLE_REGEX.exec(messageText)?.[1];

    if (!handle) {
      return null;
    }

    const config = await this.configService.getConfig(chatId);

    if (config) {
      const group = config.pingGroups.find((g) => g.handle === handle);
      return group || null;
    }

    return null;
  }

  public async createPingGroup(
    chatId: number,
    handle: string
  ): Promise<Array<PingGroupEntity>> {
    const config = await this.configService.getConfig(chatId);

    if (config) {
      config.pingGroups.push({ handle: handle, userIds: [] });
      await this.configModel
        .updateOne(
          { chatId: chatId },
          { $push: { pingGroups: { handle: handle } } }
        )
        .exec();

      await this.configService.reloadConfig(chatId);
    } else {
      this.logger.error(`Config not found for chatId: ${chatId}`);
      throw new Error("Configuration not found");
    }

    return config.pingGroups;
  }

  public async addUserToPingGroup(
    chatId: number,
    userId: number,
    handle: string
  ): Promise<boolean> {
    const config = await this.configService.getConfig(chatId);

    if (config) {
      const group = config.pingGroups.find((g) => g.handle === handle);
      if (group && !group.userIds.includes(userId)) {
        group.userIds.push(userId);
        const result = await this.configModel
          .updateOne(
            { chatId: chatId, "pingGroups.handle": handle },
            { $addToSet: { "pingGroups.$.userIds": userId } }
          )
          .exec();

        await this.configService.reloadConfig(chatId);

        return result.modifiedCount > 0;
      }
    }

    return false;
  }

  public async removeUserFromPingGroup(
    chatId: number,
    userId: number,
    handle: string
  ): Promise<boolean> {
    const config = await this.configService.getConfig(chatId);

    if (config) {
      const group = config.pingGroups.find((g) => g.handle === handle);
      if (group && group.userIds.includes(userId)) {
        group.userIds = group.userIds.filter((id) => id !== userId);
        const result = await this.configModel
          .updateOne(
            { chatId: chatId, "pingGroups.handle": handle },
            { $pull: { "pingGroups.$.userIds": userId } }
          )
          .exec();

        await this.configService.reloadConfig(chatId);

        return result.modifiedCount > 0;
      }
    }

    return false;
  }
}
