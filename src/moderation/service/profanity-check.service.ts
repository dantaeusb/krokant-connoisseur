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
        const hasWord = words.some(
          (word) => word.toLowerCase().indexOf(filter.filter as string) !== -1
        );

        if (hasWord) {
          return true;
        }

        if (filter.regexp) {
          try {
            return new RegExp(filter.regexp).test(text);
          } catch (error) {
            this.logger.error(
              `Invalid regexp in profanity filter: ${filter.regexp}`,
              error
            );
          }
        }

        return false;
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
