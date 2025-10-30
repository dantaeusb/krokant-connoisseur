import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ChatConfigEntity, ConfigSchema } from "./entity/chat-config.entity";
import { CounterEntity, CounterEntitySchema } from "./entity/counter.entiy";
import { UserEntity, UserSchema } from "./entity/user.entity";
import { ConfigController } from "./controller/config.controller";
import { MessageEntity, MessageSchema } from "./entity/message.entity";
import { MessageService } from "./service/message.service";
import { UserService } from "./service/user.service";
import { ConfigService } from "./service/config.service";
import { LoggingController } from "./controller/logging.controller";
import { FormatterService } from "./service/formatter.service";
import { ToolsController } from "./controller/tools.controller";
import { AuthorityService } from "./service/authority.service";
import { PingGroupService } from "./service/ping-group.service";
import { CommandsService } from "./service/commands.service";
import { CounterService } from "./service/counter.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatConfigEntity.COLLECTION_NAME, schema: ConfigSchema },
      { name: CounterEntity.COLLECTION_NAME, schema: CounterEntitySchema },
      { name: UserEntity.COLLECTION_NAME, schema: UserSchema },
      { name: MessageEntity.COLLECTION_NAME, schema: MessageSchema },
    ]),
  ],
  providers: [
    ConfigService,
    ConfigController,
    LoggingController,
    ToolsController,
    AuthorityService,
    CounterService,
    CommandsService,
    MessageService,
    UserService,
    PingGroupService,
    FormatterService,
  ],
  exports: [
    AuthorityService,
    CommandsService,
    MessageService,
    UserService,
    ConfigService,
    CounterService,
    FormatterService,
  ],
})
export class CoreModule {}
