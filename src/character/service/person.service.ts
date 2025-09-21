import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PersonEntity } from "../entity/person.entity";

@Injectable()
export class PersonService {
  private readonly logger = new Logger("Character/PersonService");

  constructor(
    @InjectModel(PersonEntity.COLLECTION_NAME)
    private personEntityModel: Model<PersonEntity>
  ) {}

}
