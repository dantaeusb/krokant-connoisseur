import { Injectable, Logger } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import * as z from "zod";
import * as assert from "node:assert";
import { ChatScopedToolFunction } from "@genai/decorator/tool-function.decorator";
import { AbstractToolService } from "@genai/service/abstract-tool.service";

/**
 * @todo: [MED]: I really want to find some D20 animated sticker set
 * for more variety in random choices
 */
@Injectable()
export class RandomChoiceToolService extends AbstractToolService {
  public readonly code = "random_choice";

  protected readonly logger = new Logger("Roleplay/RandomChoiceToolService");

  private readonly emojiEntropyMap: Record<number, string> = {
    5: "🏀",
    6: "🎲",
    64: "🎰",
  };

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>
  ) {
    super();
  }

  /**
   * @param chatId
   * @param optionsCount
   */
  @ChatScopedToolFunction(
    "pick_random_number",
    "Choose a random option from a given number of options.",
    [
      {
        code: "options_count",
        type: z.number().min(2).max(64).meta({
          id: "options_count",
          title: "Options Count",
          description: "Number of options to choose from",
        }),
      },
    ]
  )
  public async choiceRandom(
    chatId: number,
    optionsCount: number
  ): Promise<string> {
    assert(optionsCount <= 64, "optionsCount must be less than or equal to 64");

    const result = await this.bot.telegram.sendDice(chatId, {
      emoji: this.emojiEntropyMap[optionsCount] || this.emojiEntropyMap[6],
    });

    let choiceIndex = result.dice.value - 1;
    if (choiceIndex >= optionsCount) {
      choiceIndex = choiceIndex % optionsCount;
    }

    return choiceIndex.toString();
  }
}
