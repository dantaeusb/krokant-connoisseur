import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CounterEntity } from "../entity/counter.entiy";

@Injectable()
export class CounterService {
  constructor(
    @InjectModel(CounterEntity.COLLECTION_NAME)
    private counterModel: Model<CounterEntity>
  ) {}

  public async getNextSequence(name: string): Promise<number> {
    const updatedCounter = await this.counterModel
      .findOneAndUpdate(
        { name },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .exec();

    return updatedCounter.sequence;
  }
}
