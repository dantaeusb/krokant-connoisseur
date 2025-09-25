import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PersonEntity } from "../entity/person.entity";
import { UserDocument, UserEntity } from "@core/entity/user.entity";

export type PersonifiedUser = UserEntity & {
  person?: PersonEntity;
};

@Injectable()
export class PersonService {
  private readonly logger = new Logger("Character/PersonService");

  constructor(
    @InjectModel(PersonEntity.COLLECTION_NAME)
    private personEntityModel: Model<PersonEntity>
  ) {}

  public async joinPersonToUsers(
    users: Array<UserDocument>
  ): Promise<Array<PersonifiedUser>> {
    const personChatUserIdPairs: Array<[number, number]> = users.map((user) => [
      user.chatId,
      user.userId,
    ]);

    if (personChatUserIdPairs.length === 0) {
      return users as Array<PersonifiedUser>;
    }

    const persons = await this.personEntityModel
      .find({
        $or: personChatUserIdPairs.map(([chatId, userId]) => ({
          chatId,
          userId,
        })),
      })
      .lean()
      .exec();

    const personMap: Map<string, PersonEntity> = new Map();
    persons.forEach((person) => {
      personMap.set(`${person.chatId}-${person.userId}`, person);
    });

    return users.map((user) => {
      const person = personMap.get(`${user.chatId}-${user.userId}`);
      return { ...user.toObject(), person };
    });
  }

  public async getPerson(
    chatId: number,
    userId: number,
    createIfNotExists = false
  ): Promise<PersonEntity | null> {
    return await this.personEntityModel
      .findOneAndUpdate(
        {
          chatId,
          userId,
        },
        {},
        {
          upsert: createIfNotExists,
          new: createIfNotExists,
          setDefaultsOnInsert: true,
        }
      )
      .exec();
  }

  public async createPerson(
    chatId: number,
    userId: number,
    name: string
  ): Promise<PersonEntity> {
    const newPerson = new this.personEntityModel({
      chatId,
      userId,
      name,
    });

    return await newPerson.save();
  }

  /**
   * Deletes the PersonEntity for a user as part of the forgetme command.
   * This completely removes the person record and all associated data.
   * @param chatId The chat ID
   * @param userId The user ID
   * @returns True if the person record was deleted, false if no person record existed
   */
  public async clearPersonalData(
    chatId: number,
    userId: number
  ): Promise<boolean> {
    const result = await this.personEntityModel
      .deleteOne({ chatId, userId })
      .exec();

    this.logger.log(
      `Deleted person entity for user ${userId} in chat ${chatId}. Deleted: ${result.deletedCount}`
    );

    return result.deletedCount > 0;
  }
}
