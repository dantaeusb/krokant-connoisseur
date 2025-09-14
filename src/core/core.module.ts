import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserEntity, UserSchema } from "./entity/user.entity";
import { MessageService } from "./service/message.service";
import { UserService } from "./service/user.service";
import { ConfigService } from "@core/service/config.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
  ],
  providers: [
    MessageService,
    UserService,
  ],
  exports: [MessageService, UserService, ConfigService],
})
export class CoreModule {}
