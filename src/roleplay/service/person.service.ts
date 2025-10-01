import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PersonDocument, PersonEntity } from "../entity/person.entity";
import { UserDocument, UserEntity } from "@core/entity/user.entity";
import { Cron } from "@nestjs/schedule";
import {
  PersonThoughtDocument,
  PersonThoughtEntity,
} from "@roleplay/entity/person/thought.entity";

export type PersonifiedUser = UserEntity & {
  person?: PersonEntity;
};

@Injectable()
export class PersonService {
  private static THOUGHT_HALF_LIFE_DAYS = 4;

  private readonly logger = new Logger("Roleplay/PersonService");

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
      .exec();

    const personMap: Map<string, PersonDocument> = new Map();
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
  ): Promise<PersonDocument | null> {
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

  public async updateFacts(
    chatId: number,
    userId: number,
    facts: Array<string>
  ): Promise<PersonEntity | null> {
    return await this.personEntityModel
      .findOneAndUpdate(
        {
          chatId,
          userId,
        },
        { characteristics: facts },
        {
          new: true,
        }
      )
      .exec();
  }

  public getThoughtOpinionModifier = (
    thought: PersonThoughtDocument,
    currentDate?: Date
  ) => {
    let modifier = 0;

    let hostility = 0;
    const hostileThought = thought.factors.find(
      (factor) => factor.factor === "hostile"
    );
    if (hostileThought) {
      hostility = hostileThought.value / 10;
    }

    let repetitiveness = 0;
    const repetitiveThought = thought.factors.find(
      (factor) => factor.factor === "repetitiveness"
    );
    if (repetitiveThought) {
      repetitiveness = repetitiveThought.value / 10;
    }

    let engagement = 0;
    const engagementThought = thought.factors.find(
      (factor) => factor.factor === "engagement"
    );
    if (engagementThought) {
      engagement = engagementThought.value / 10;
    }

    let kindness = 0;
    const kindnessThought = thought.factors.find(
      (factor) => factor.factor === "kindness"
    );
    if (kindnessThought) {
      kindness = kindnessThought.value / 10;
    }

    let playfulness = 0;
    const playfulnessThought = thought.factors.find(
      (factor) => factor.factor === "playfulness"
    );
    if (playfulnessThought) {
      playfulness = playfulnessThought.value / 10;
    }

    modifier = -((hostility * 10) * (repetitiveness * 5));

    if (currentDate) {
      const days =
        (currentDate.getTime() - thought.date.getTime()) /
        (1000 * 60 * 60 * 24);
      const halfLives = days / PersonService.THOUGHT_HALF_LIFE_DAYS;

      return Math.round(modifier / Math.pow(2, halfLives));
    }

    return Math.round(modifier);
  };

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

    this.logger.debug(
      `Deleted person entity for user ${userId} in chat ${chatId}. Deleted: ${result.deletedCount}`
    );

    return result.deletedCount > 0;
  }

  public async countInteraction(chatId: number, userId: number): Promise<void> {
    await this.personEntityModel
      .findOneAndUpdate(
        { chatId, userId },
        { $inc: { interactionsCount: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec();
  }

  @Cron("*/15 * * * *")
  public async cooldownInteractions() {
    const result = await this.personEntityModel
      .updateMany(
        { interactionsCount: { $gt: 0 } },
        { $inc: { interactionsCount: -1 } }
      )
      .exec();

    this.logger.log(
      `Reset daily interactions for ${result.modifiedCount} persons`
    );
  }
}
