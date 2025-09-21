import { Injectable } from "@nestjs/common";

@Injectable()
export class TriggerService {
  private static TRIGGERS: Array<Trigger> = [
    { phrase: "@grok", chance: 0.9 },
    { phrase: "@gork", chance: 0.9 },
    { phrase: "@dork", chance: 0.9 },
    { phrase: "clanker", chance: 0.8 },
    { phrase: "clankkka", chance: 0.8 },
    { phrase: "clanker", chance: 0.8 },
    { phrase: "KrokantConnoisseurChatBot", chance: 1 },
  ];

  public triggered(text: string): boolean {
    const trigger = this.getTrigger(text);

    if (trigger) {
      return this.isTriggered(trigger.chance);
    }

    return false;
  }

  public getTrigger(text: string): Trigger | null {
    const lowerText = text.toLowerCase();
    return TriggerService.TRIGGERS.find((trigger) => {
      if (trigger.phrase instanceof RegExp) {
        return trigger.phrase.test(lowerText);
      }

      return lowerText.includes(trigger.phrase);
    });
  }

  /**
   * Whether the bot should respond to a message, later will
   * also include mood and other factors to answer less or more often.
   * @param chance
   */
  public isTriggered(chance: number): boolean {
    return Math.random() < chance;
  }
}

type Trigger = {
  phrase: string | RegExp;
  chance: number;
};
