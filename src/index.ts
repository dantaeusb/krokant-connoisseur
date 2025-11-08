import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { LogLevel } from "@nestjs/common";

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === "production";
  console.log(
    `Starting application in ${
      isProduction ? "production" : "development"
    } mode`
  );
  const logLevels: LogLevel[] = isProduction
    ? ["log", "warn", "error", "fatal"]
    : ["debug", "log", "warn", "error", "fatal"];

  if (!isProduction) {
    if (process.argv.includes("--verbose")) {
      logLevels.push("debug", "verbose");
    }
  } else {
    if (process.argv.includes("--debug")) {
      logLevels.push("debug");
    }

    if (process.argv.includes("--verbose")) {
      logLevels.push("debug", "verbose");
    }
  }

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });
  await app.listen(3000);
}

bootstrap();
