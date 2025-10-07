import { Injectable, Logger } from "@nestjs/common";
import { REACTION_CONSTANTS } from "@core/constants/reaction.constants";

@Injectable()
export class FormatterService {
  private static TELEGRAM_UNESCAPED_HANDLE_REGEX =
    /`[^`]*`|@([a-zA-Z0-9_]{5,32})/gm;

  private readonly logger = new Logger("Core/FormatterService");
  private readonly formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  public escapeMarkdown(text: string): string {
    text.replace('\*\*', '\*');
    return text.replace(/([#+=|{}])/gm, "\\$1");
  }

  public escapeHandles(text: string): string {
    return text.replace(
      FormatterService.TELEGRAM_UNESCAPED_HANDLE_REGEX,
      (match, handle) => {
        if (handle) {
          this.logger.log("Found handle to escape: " + handle);
          return `\`@${handle}\``;
        }
        return match;
      }
    );
  }

  public formatRelativeTime(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "unknown time";
    }

    const now = new Date();
    const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);

    const intervals: { [key: string]: number } = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const unit in intervals) {
      const interval = intervals[unit];
      if (Math.abs(diffInSeconds) >= interval) {
        const value = Math.round(diffInSeconds / interval);
        return this.formatter.format(
          value,
          unit as Intl.RelativeTimeFormatUnit
        );
      }
    }

    return "a moment ago";
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
      case 5:
        return REACTION_CONSTANTS.FIVE;
      case 6:
        return REACTION_CONSTANTS.SIX;
      case 7:
        return REACTION_CONSTANTS.SEVEN;
      case 8:
        return REACTION_CONSTANTS.EIGHT;
      case 9:
        return REACTION_CONSTANTS.NINE;
      default:
        return REACTION_CONSTANTS.CROSS;
    }
  }
}
