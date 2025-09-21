import { Injectable } from "@nestjs/common";
import { REACTION_CONSTANTS } from "@core/constants/reaction.constants";

@Injectable()
export class FormatterService {
  public escapeMarkdownV2(text: string): string {
    return text.replace(/([#+=|{}])/gm, "\\$1");
  }

  public getReactionFromNumber(num: number): bigint {
    switch (num) {
      case 0:
        return REACTION_CONSTANTS.ZERO;
      case 1:
        return REACTION_CONSTANTS.ONE;
      case 2:
        return REACTION_CONSTANTS.TWO;
      case 3:
        return REACTION_CONSTANTS.THREE;
      case 4:
        return REACTION_CONSTANTS.FOUR;
      /*case 5:
        return REACTION_CONSTANTS.FIVE;
      case 6:
        return REACTION_CONSTANTS.SIX;
      case 7:
        return REACTION_CONSTANTS.SEVEN;
      case 8:
        return REACTION_CONSTANTS.EIGHT;
      case 9:
        return REACTION_CONSTANTS.NINE;*/
      default:
        return REACTION_CONSTANTS.CROSS;
    }
  }
}
