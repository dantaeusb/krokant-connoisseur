import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserEntity, UserSchema } from "./entity/user.entity";
import { MessageService } from "./service/message.service";
import { UserService } from "./service/user.service";
import { ConfigService } from "@core/service/config.service";
import { ConfigEntity, ConfigSchema } from "@core/entity/config.entity";
import { ConfigController } from "@core/controller/config.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: ConfigEntity.name, schema: ConfigSchema },
    ]),
  ],
  providers: [ConfigController, MessageService, UserService, ConfigService],
  exports: [MessageService, UserService, ConfigService],
})
export class CoreModule {}
