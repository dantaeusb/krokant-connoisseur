import { Injectable } from "@nestjs/common";
import { PersonService } from "./person.service";

@Injectable()
export class TriggerService {
  private static TRIGGERS: Array<Trigger> = [
    { phrase: "@grok", chance: 1 },
    { phrase: "@gork", chance: 1 },
    { phrase: "@dork", chance: 1 },
    { phrase: "@KrokantConnoisseurChatBot", chance: 1 },
    { phrase: "clanker", chance: 0.7 },
  ];

  constructor(private readonly personService: PersonService) {}

  /**
   * @param text
   * @param userId
   */
  public triggered(text: string): boolean {
    const trigger = this.getTrigger(text);

    if (trigger) {
      return Math.random() < trigger.chance;
    }

    return false;
  }

  public async isOnCooldown(chatId: number, userId: number): Promise<boolean> {
    const person = await this.personService.getPerson(chatId, userId);
    if (!person) {
      return false;
    }

    return person.interactionsCount > 5;
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
}

type Trigger = {
  phrase: string | RegExp;
  chance: number;
};
