import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class ConfigService {
  private static FALLBACK_SYSTEM_PROMPT = "You are a helpful assistant.";

  private readonly logger = new Logger(ConfigService.name);

  public readonly systemPrompt: string;

  constructor() {
    this.systemPrompt = this.loadSystemPrompt();
  }

  // Load the system prompt from a .prompt file in the current working directory.
  private loadSystemPrompt(): string {
    try {
      const promptPath = path.resolve(process.cwd(), ".prompt");
      if (!fs.existsSync(promptPath)) {
        this.logger.warn(
          `.prompt file not found at ${promptPath}. Using empty system prompt.`
        );
        return "";
      }
      const raw = fs.readFileSync(promptPath, "utf8");
      // Split into lines, drop those starting with # after trimming whitespace, then join.
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      return lines.join("\n");
    } catch (err) {
      this.logger.error(
        "Failed to load system prompt",
        err instanceof Error ? err.stack : String(err)
      );
      return ConfigService.FALLBACK_SYSTEM_PROMPT;
    }
  }
}
