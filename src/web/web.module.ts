import { Module } from "@nestjs/common";
import { FileController } from "./controller/file.controller";
import { RandomController } from "./controller/random.controller";

@Module({
  controllers: [FileController, RandomController],
})
export class WebModule {}
