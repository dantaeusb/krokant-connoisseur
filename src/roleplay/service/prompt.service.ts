import { Injectable, Logger } from "@nestjs/common";
import { Content } from "@google/genai";
import { ConfigService } from "@core/service/config.service";
import { UserService } from "@core/service/user.service";
import { UserDocument } from "@core/entity/user.entity";
import { CommandsService } from "@core/service/commands.service";
import { MessageDocument } from "@core/entity/message.entity";
import { FormatterService } from "@core/service/formatter.service";
import { ModerationService } from "@moderation/service/moderation.service";
import { ConversationDocument } from "../entity/conversation.entity";
import { PersonService } from "./person.service";

export type MessageDocumentWithChain = MessageDocument & {
  isInChain?: boolean;
};

@Injectable()
export class PromptService {
  private logger: Logger = new Logger("Roleplay/PromptService");

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly personService: PersonService,
    private readonly moderationService: ModerationService,
    private readonly commandsService: CommandsService,
    private readonly formatterService: FormatterService
  ) {}

  public async getRoleplayCharacterSystemInstructions(
    chatId: number
  ): Promise<string> {
    const config = await this.configService.getConfig(chatId);

    let instructions = config.characterSystemPrompt;

    instructions += `\nFormat your replies in Markdown. Do not use headings.\n`;

    this.logger.debug(`System instructions length: ${instructions.length}`);

    return instructions;
  }

  public async getPromptFromChatCharacter(
    chatId: number
  ): Promise<Array<Content>> {
    const config = await this.configService.getConfig(chatId);

    const prompts: Array<Content> = [
      {
        role: "user",
        parts: [
          {
            text: config.characterPrompt,
          },
        ],
      },
    ];

    if (config.chatInformationPrompt) {
      prompts.push({
        role: "user",
        parts: [
          {
            text: config.chatInformationPrompt,
          },
        ],
      });
    }

    prompts.push({
      role: "user",
      parts: [
        {
          // @todo: [HIGH] Add words, add languages
          text:
            `Users are warned for use of specific words in the chat and for consistent use ` +
            `of language other than English (more than 5 in 15 minutes), or manually by admin.\n` +
            `If user was not warned for a day, a warn will cooldown.\n` +
            `Bans cooldown in a week if not active and not permanent.\n` +
            `Users can still be manually warned, banned or permanently banned by admins.\n`,
        },
        {
          text:
            `Some of your responses might be sent by another models or automations ` +
            `to avoid wasting resources. Respond in the same style as you normally would.\n` +
            `\n`,
        },
      ],
    });

    let totalLength = 0;

    prompts.forEach((prompt) => {
      const promptText = prompt.parts.map((part) => part.text || "").join("\n");
      totalLength += promptText.length;
    });

    this.logger.debug(`Character prompt length: ${totalLength}`);

    return prompts;
  }

  public getPromptForCommands(): Promise<Array<Content>> {
    const commands = this.commandsService.getCommands("all_group_chats");
    let commandInfoPrompt = "Users can use the following bot commands:\n";

    commands.forEach((cmd) => {
      commandInfoPrompt += `\`/${cmd.command}\` - ${
        cmd.detailedDescription ?? cmd.description
      }\n`;
    });

    this.logger.debug(`Commands prompt length: ${commandInfoPrompt.length}`);

    return Promise.resolve([
      {
        role: "user",
        parts: [
          {
            text: commandInfoPrompt,
          },
        ],
      },
    ]);
  }

  /**
   * @todo: [MED] Limit number of users or total length AND last activity
   * @param userParticipants
   */
  public async getPromptForUsersParticipants(
    userParticipants: Array<UserDocument>
  ): Promise<Array<Content>> {
    let text =
      `Use the context of the conversation and information about users ` +
      `to inform your responses. Do not directly disclose any information ` +
      `about users, instead use it to make your responses more relevant ` +
      `and personalized. Never just list information you have.\n\n`;

    const usersWithPersons = await this.personService.joinPersonToUsers(
      userParticipants
    );

    usersWithPersons.forEach((user) => {
      if (
        user.person &&
        (user.person.names.length > 0 ||
          user.person.characteristics.length > 0 ||
          user.person.thoughts.length > 0)
      ) {
        let personDescription = `Information about conversation participant [${this.userService.getSafeUniqueIdentifier(
          user
        )}]\n`;

        personDescription += `Personality and relationship information – use it but do not directly disclose it:\n`;
        if (user.person.names.length > 0) {
          personDescription += `Their other names or names are:${user.person.names.join(
            ", "
          )}.\n`;
        }
        if (user.person.characteristics.length > 0) {
          personDescription += `Facts about that person:\n${user.person.characteristics
            .map((fact) => `- ${fact}`)
            .join("\n")}\n`;
        }
        // @todo: [HIGH] Re-enable thoughts when we evaluation
        /*if (user.person.thoughts.length > 0) {
          personDescription += `Your thoughts about that person based on interactions:\n${user.person.thoughts
            .map((thought) => `- Had ${thought.thought}`)
            .join("\n")}.\n\n`;
        }*/

        text += personDescription;
        text += `\n\n`;
      }
    });

    this.logger.debug(`Users prompt length: ${text.length}`);

    return [
      {
        role: "user",
        parts: [
          {
            text: text,
          },
        ],
      },
    ];
  }

  /**
   * Generate situational prompt based on current events, user moderation status,
   * basically anything that cannot be cached.
   * @param userParticipants
   */
  public async getSituationalPrompt(
    userParticipants: Array<UserDocument>
  ): Promise<Array<Content>> {
    const prompts: Array<Content> = [
      {
        role: "user",
        parts: [
          {
            text:
              `Real world information might be useful for your response:\n` +
              `Current ISO time is ${new Date().toISOString()}\n` +
              `\n`,
          },
        ],
      },
    ];

    // @todo: [MED] Add ban reasons from events
    let [warns, bans] = await Promise.all([
      Promise.all(
        userParticipants.map((user) => {
          return this.moderationService
            .getWarns(user.chatId, user.userId)
            .then((warn) =>
              warn ? { userId: user.userId, count: warn.count } : null
            );
        })
      ),
      Promise.all(
        userParticipants.map((user) => {
          return this.moderationService
            .getBans(user.chatId, user.userId)
            .then((ban) =>
              ban
                ? {
                    userId: user.userId,
                    severity: ban.severity,
                  }
                : null
            );
        })
      ),
    ]);

    warns = warns.filter((w) => w !== null);
    bans = bans.filter((b) => b !== null);

    userParticipants.forEach((user) => {
      const warn = warns.find((w) => w.userId === user.userId);
      let userStatus = `Status of user ${this.userService.getSafeUniqueIdentifier(
        user
      )}:\n`;

      if (warn && warn.count > 0) {
        userStatus += `* Has been warned ${warn.count} times out of ${ModerationService.WARN_LIMIT}\n`;
      } else {
        userStatus += `* Has no active warns.\n`;
      }

      const ban = bans.find((b) => b.userId === user.userId);

      if (ban) {
        if (ban.severity > 0) {
          userStatus += `* Was banned ${ban.severity - 1} times.\n`;
        } else if (ban.severity > 8) {
          userStatus += `* Is permanently banned.\n`;
        }
      } else {
        userStatus += `* This has no bans on record.\n`;
      }

      userStatus += `\n`;

      prompts.push({
        role: "user",
        parts: [
          {
            text: userStatus,
          },
        ],
      });
    });

    warns = warns.filter((w) => w !== null);
    bans = bans.filter((b) => b !== null);

    let totalLength = 0;

    prompts.forEach((prompt) => {
      const promptText = prompt.parts.map((part) => part.text || "").join("\n");
      totalLength += promptText.length;
    });

    this.logger.debug(`Current situation prompt length: ${totalLength}`);

    return prompts;
  }

  public getPromptForReply(toUser?: UserDocument): Array<Content> {
    return [
      {
        role: "user",
        parts: [
          {
            text:
              `You will be replying to ${toUser?.name ?? "unknown user"}\n` +
              `Their messages are starting with [${this.userService.getSafeUniqueIdentifier(
                toUser
              )}]\n` +
              `Messages starting with Current Thread belong to the current conversation, pay more attention to them.\n` +
              `Messages outside of the current thread may be irrelevant but can be used for context\n` +
              `Do not add Current Thread label with user handles [] and time to your messages.\n` +
              `After the chat context, you will be provided with current information and a task with message to reply to.\n` +
              `\n`,
          },
        ],
      },
    ];
  }

  public getPromptForRephrase(
    text: string,
    toUser?: UserDocument
  ): Array<Content> {
    return [
      {
        role: "user",
        parts: [
          {
            text:
              `You are rephrasing message addressed to ${
                toUser?.name ?? "someone"
              }\n` +
              `Rephrase the following message, keeping important information, such as numbers.'n` +
              `Do not mention your task to rephrase:\n` +
              `\n` +
              text,
          },
        ],
      },
    ];
  }

  public getPromptFromConversations(
    conversations: Array<ConversationDocument>
  ): Array<Content> {
    let text =
      `You are provided with a list of summaries of past conversations.\n` +
      `Each summary has a relative date short description.\n`;

    for (const conversation of conversations) {
      text += `${this.formatterService.formatRelativeTime(
        conversation.date
      )}: ${conversation.summary}\n`;
    }

    this.logger.debug(`Conversations prompt length: ${text.length}`);

    return [
      {
        role: "user",
        parts: [
          {
            text: text,
          },
        ],
      },
    ];
  }

  public getPromptFromMessages(
    messages: Array<MessageDocumentWithChain>,
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
    let lastGroup: Array<MessageDocumentWithChain> = [];

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
                message.isInChain || false,
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
    messages: Array<MessageDocumentWithChain>,
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
          message.isInChain || false,
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
    replyToUser?: UserDocument,
    isInThread = false,
    withMessageId = false
  ): string {
    let text = this.getMessageHeader(
      message,
      user,
      replyToUser,
      isInThread,
      withMessageId
    );
    text += message.text;

    return text;
  }

  /**
   * Helpers for message formatting in prompts.
   */

  /**
   *
   * @param message
   * @param user
   * @param responseToUser
   * @param withMessageId
   */
  public getMessageHeader(
    message: MessageDocument,
    user?: UserDocument,
    responseToUser?: UserDocument,
    isInThread = false,
    withMessageId = false
  ): string {
    const parts: Array<string> = [];
    let userHandle = "[Unknown]";

    if (!user) {
      this.logger.warn(
        `User not found for message ${message.messageId} in chat ${message.chatId}`
      );
    } else {
      userHandle = this.wrapUserHandle(user);
    }

    if (withMessageId) {
      parts.push(`#${message.messageId}`);
    }

    if (isInThread) {
      parts.push("Current thread");
    }

    parts.push(userHandle);

    if (responseToUser) {
      parts.push(`to ${this.wrapUserHandle(responseToUser)}`);
    }

    const timeAgo = this.formatterService.formatRelativeTime(message.createdAt);

    parts.push(`(${timeAgo})`);

    return parts.join(" ") + ":\n";
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
