import { ConfigService } from "@/core/service/config.service";
import { Injectable, Logger } from "@nestjs/common";
import { ProfanityFilterEntity } from "@moderation/entity/profanity-filter.entity";

@Injectable()
export class ProfanityCheckService {
  private readonly logger = new Logger("Moderation/ProfanityCheckService");

  constructor(private readonly configService: ConfigService) {}

  public async containsProfanity(
    chatId: number,
    text: string
  ): Promise<boolean> {
    const words = text.toLowerCase().split(/\s+/);

    const config = await this.configService.getConfig(chatId);

    const triggeredFilters = config.profanityFilters.filter(
      (filter: ProfanityFilterEntity) => {
        if (filter.type === "text") {
          // @todo: [LOW] Better ways to do type check
          return words.some(
            (word) => word.toLowerCase().indexOf(filter.filter as string) !== -1
          );
        } else if (filter.type === "regexp") {
          if (!(filter.filter instanceof RegExp)) {
            this.logger.error(
              `Profanity filter is not a valid RegExp: ${filter.filter}`
            );

            try {
              const match = (filter.filter as string).match(
                new RegExp("^\/(.*?)\/(.*)$")
              );
              if (match) {
                filter.filter = new RegExp(match[1], match[2]);
              } else {
                filter.filter = new RegExp(filter.filter as string);
              }

              return words.some((word) => (filter.filter as RegExp).test(word));
            } catch (e) {
              this.logger.error("Failed to parse regexp", filter.filter, e);
              return false;
            }
          } else {
            return words.some((word) => (filter.filter as RegExp).test(word));
          }
        }
      }
    );

    triggeredFilters.forEach((filter) => {
      this.logger.log(
        `Message triggered profanity filter: ${filter.filter}`,
        text
      );
    });

    return triggeredFilters.length > 0;
  }
}
