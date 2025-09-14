import { Injectable } from "@nestjs/common";
import { Context } from "telegraf";
import { Update } from "telegraf/types";
import { UserService } from "@core/service/user.service";

/**
 * General message utilities.
 */
@Injectable()
export class MessageService {
  constructor(private readonly userService: UserService) {}

  public async getTargetUserFromMessage(
    context: Context<Update.MessageUpdate>
  ): Promise<number | null> {
    const mentionEntities = context.entities("text_mention", "mention");

    for (const entity of mentionEntities) {
      if (entity.type === "mention") {
        const user = await this.userService.getUserByUsername(context.chat.id, entity.fragment);
        if (user) {
          return user.userId;
        } else {
          return null;
        }
      }

      if (entity.type === "text_mention" && entity.user) {
        return entity.user.id;
      }
    }

    if (
      "message" in context.update &&
      "reply_to_message" in context.update.message
    ) {
      return context.update.message.reply_to_message.from.id;
    }

    return null;
  }
}
