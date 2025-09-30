import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@core/service/config.service";
import { UserService } from "@core/service/user.service";
import { UserDocument, UserEntity } from "@core/entity/user.entity";
import { MessageDocument } from "@core/entity/message.entity";
import { FormatterService } from "@core/service/formatter.service";
import { Content } from "@google/genai";

@Injectable()
export class PromptService {
  private logger: Logger = new Logger("Roleplay/PromptService");

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly formatterService: FormatterService
  ) {}

  public getPromptFromMessages(
    messages: Array<MessageDocument>,
    participants: Array<UserDocument>,
    separateBotResponses = true,
    withMessageIds = false
  ): Array<Content> {
    if (!separateBotResponses) {
      return [
        {
          role: "user",
          parts: [
            {
              text: this.formatMessageGroup(
                messages,
                participants,
                withMessageIds
              ),
            },
          ],
        },
      ];
    }

    const botUser = participants.find(
      (user) => user.userId === this.configService.botId
    );

    const contents: Array<Content> = [];
    let lastGroup: Array<MessageDocument> = [];

    for (const message of messages) {
      if (message.userId === this.configService.botId) {
        if (lastGroup.length > 0) {
          contents.push({
            role: "user",
            parts: [
              {
                text: this.formatMessageGroup(
                  lastGroup,
                  participants,
                  withMessageIds
                ),
              },
            ],
          });
          lastGroup = [];
        }

        contents.push({
          role: "model",
          parts: [
            {
              text: this.formatMessageContent(
                message,
                botUser,
                null,
                false,
                withMessageIds
              ),
            },
          ],
        });
      } else {
        lastGroup.push(message);
      }
    }

    if (lastGroup.length > 0) {
      contents.push({
        role: "user",
        parts: [
          {
            text: this.formatMessageGroup(
              lastGroup,
              participants,
              withMessageIds
            ),
          },
        ],
      });
    }

    return contents;
  }

  public formatMessageGroup(
    messages: Array<MessageDocument>,
    participants: Array<UserDocument>,
    withMessageIds = false
  ): string {
    let result = "";
    const messageMap: Map<number, MessageDocument> = new Map();
    messages.forEach((message) => messageMap.set(message.messageId, message));
    const userMap: Map<number, UserDocument> = new Map();
    participants.forEach((user) => userMap.set(user.userId, user));

    let lastMessage = null;
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const user = userMap.get(message.userId);
      const responseToUser =
        message.replyToMessageId &&
        messageMap.get(message.replyToMessageId) &&
        userMap.get(messageMap.get(message.replyToMessageId).userId);

      if (this.canJoinMessages(lastMessage, message)) {
        // Same user as last message, no need to repeat the header
        result += `${message.text}\n\n`;
      } else {
        result += `${this.getMessageHeader(
          message,
          user,
          responseToUser,
          withMessageIds
        )}${message.text}\n\n`;
      }

      lastMessage = message;
    }

    return result;
  }

  public formatMessageContent(
    message: MessageDocument,
    user?: UserDocument,
    responseToUser?: UserDocument,
    isInThread = false,
    withMessageId = false
  ): string {
    let text = "";

    if (isInThread) {
      text += "> ";
    }

    text += this.getMessageHeader(message, user, responseToUser, withMessageId);
    text += message.text;

    return text;
  }

  public getMessageHeader(
    message: MessageDocument,
    user?: UserDocument,
    responseToUser?: UserDocument,
    withMessageId = false
  ): string {
    let text = "";
    let userHandle = "[Unknown]";

    if (!user) {
      this.logger.warn(
        `User not found for message ${message.messageId} in chat ${message.chatId}`
      );
    } else {
      userHandle = this.wrapUserHandle(user);
    }

    if (withMessageId) {
      text += `#${message.messageId} `;
    }

    text += userHandle;

    if (responseToUser) {
      text += ` to ${this.wrapUserHandle(responseToUser)}`;
    }

    const timeAgo = this.formatterService.formatRelativeTime(message.createdAt);

    text += ` (${timeAgo}):\n`;

    return text;
  }

  public wrapUserHandle(
    user?: Pick<UserDocument, "userId" | "username">
  ): string {
    if (user.userId === this.configService.botId) {
      return "[You]";
    }

    return `[${this.userService.getSafeUniqueIdentifier(user)}]`;
  }

  /**
   * Useful for parsing user handles from GenAI responses or commands.
   * @param chatId
   * @param handle
   * @param participants
   */
  public getUserFromHandle(
    chatId: number,
    handle: string,
    participants?: Array<UserDocument>
  ): Promise<UserDocument | null> {
    let supposedHandle = handle.trim();
    supposedHandle = supposedHandle.replace(/^\[|\]$/g, "");

    if (supposedHandle.startsWith("@") && supposedHandle.length > 1) {
      supposedHandle = supposedHandle.slice(1);
    }

    if (supposedHandle.length === 0) {
      return null;
    }

    const numericIdMatch = supposedHandle.match(/^ID:(\d+)$/);

    if (numericIdMatch) {
      const userId = parseInt(numericIdMatch[1], 10);

      this.logger.debug("Looking up user by ID: " + userId);

      if (participants) {
        const user = participants.find((u) => u.userId === userId);
        if (user) {
          return Promise.resolve(user);
        }
      }

      return this.userService.getUser(chatId, userId);
    }

    if (supposedHandle.toLowerCase() === "you") {
      this.logger.debug("Looking up bot user");

      return this.userService.getUser(chatId, this.configService.botId);
    }

    this.logger.debug("Looking up user by username: " + supposedHandle);

    if (participants) {
      const user = participants.find(
        (u) =>
          u.username &&
          u.username.toLowerCase() === supposedHandle.toLowerCase()
      );
      if (user) {
        return Promise.resolve(user);
      }
    }

    return this.userService.getUserByUsername(chatId, supposedHandle);
  }

  public canJoinMessages(
    first?: MessageDocument,
    second?: MessageDocument
  ): boolean {
    if (!first || !second) {
      return false;
    }

    if (first.userId !== second.userId) {
      return false;
    }

    const timeDiff = second.date.getTime() - first.date.getTime();
    return timeDiff <= 5 * 60 * 1000;
  }
}
