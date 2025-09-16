import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserSchema } from "./entity/user.entity";
import { MessageService } from "./service/message.service";
import { UserService } from "./service/user.service";
import { ConfigService } from "./service/config.service";
import { ConfigSchema } from "./entity/config.entity";
import { ConfigController } from "./controller/config.controller";
import { MessageSchema } from "./entity/message.entity";
import { LoggingController } from "./controller/logging.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "config", schema: ConfigSchema },
      { name: "user", schema: UserSchema },
      { name: "message", schema: MessageSchema },
    ]),
  ],
  providers: [
    ConfigController,
    LoggingController,
    MessageService,
    UserService,
    ConfigService,
  ],
  exports: [MessageService, UserService, ConfigService],
})
export class CoreModule {}
