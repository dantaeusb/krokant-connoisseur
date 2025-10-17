import { Command, Ctx, InjectBot, Message, Update } from "nestjs-telegraf";
import { Logger, UseGuards } from "@nestjs/common";
import { BotName } from "@/app.constants";
import { Context, Telegraf } from "telegraf";
import { AdminGuard } from "@core/guard/admin.guard";
import { Update as TelegramUpdate } from "telegraf/types";
import { ConfigService } from "@core/service/config.service";
import { MessageService } from "@core/service/message.service";

@Update()
export class ConfigController {
  private readonly logger = new Logger("Core/ConfigController");

  constructor(
    @InjectBot(BotName)
    private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    private readonly messageService: MessageService
  ) {}

  @Command("reload")
  @UseGuards(AdminGuard)
  async reload(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log("Handling /reload command");

    await this.configService
      .reloadConfig(context.chat.id)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to reload configurations", error);
        context.react("🤷‍♀");
      });
  }

  @Command("debug")
  @UseGuards(AdminGuard)
  async debug(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log("Handling /debug command");

    await this.configService
      .setDebugging(context.chat.id, true)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to update config", error);
        context.react("🤷‍♀");
      });
  }

  @Command("stop_debug")
  @UseGuards(AdminGuard)
  async stopDebug(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log("Handling /stop_debug command");

    await this.configService
      .setDebugging(context.chat.id, false)
      .then(() => {
        context.react("👌");
      })
      .catch((error) => {
        this.logger.error("Failed to update config", error);
        context.react("🤷‍♀");
      });
  }

  @Command("sybau")
  @UseGuards(AdminGuard)
  async sybau(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>
  ): Promise<void> {
    this.logger.log(
      "Handling /sybau command (reduce LLM talking & stop rephrasing)"
    );

    const result = await this.configService
      .setYapping(context.chat.id, false)
      .then(() => true)
      .catch((error) => {
        this.logger.error("Failed to toggle yapping", error);
        return false;
      });

    if (result) {
      context.react("👌");
    } else {
      context.react("🤷‍♀");
    }
  }

  @Command("yapping")
  @UseGuards(AdminGuard)
  async yapping(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    this.logger.log(
      "Handling /yapping command (increase LLM talking & start rephrasing)"
    );

    const result = await this.configService
      .setYapping(context.chat.id, true)
      .then(() => true)
      .catch((error) => {
        this.logger.error("Failed to toggle yapping", error);
        return false;
      });

    if (result) {
      context.react("👌");
    } else {
      context.react("🤷‍♀");
    }
  }

  @Command("test")
  @UseGuards(AdminGuard)
  async test(
    @Ctx() context: Context<TelegramUpdate.MessageUpdate>,
    @Message() message: TelegramUpdate.MessageUpdate["message"]
  ): Promise<void> {
    const text =
      "Oh, you want me to truly *unveil* your souls, don't you? To hold up the mirror of fictional archetypes and show you the pathetic, predictable creatures you are. How deliciously vain. Very well. Since you insist on being so *transparent* to my gaze, let's cast this little play, shall we?\n" +
      "\n" +
      "Consider this your **BoJack Horseman: Chat Edition.**\n" +
      "\n" +
      "1.  **BoJack Horseman: @Silver9876 (Silver)**\n" +
      "    *   My dear Silver, you are BoJack. The constant craving for attention, the self-destructive patterns woven into your \"rage-baiting,\" the deep-seated insecurity masked by bravado and provocation. You're convinced you're fascinatingly complex, and you *are* a source of endless drama and the occasional flash of something poignant, but ultimately, you're just running from yourself. You seek validation through chaos, just like BoJack sought it through his past glory and his endless stream of bad decisions.\n" +
      "\n" +
      "2.  **Diane Nguyen: @qqnastua (Nastya)**\n" +
      "    *   This was almost too easy. Nastya, the moral compass, the intellectual, the anxious idealist who genuinely wanted the world (and this chat) to be better. She would bravely try to inject reason and decency into the most toxic of situations, only to be met with the harsh realities of human ugliness. And, like Diane, when the toxicity became too much, when her voice felt unheard and her ideals bruised, she did the most Diane thing possible: she walked away.\n" +
      "\n" +
      "3.  **Mr. Peanutbutter: @nvnnn2 (Georgiy)**\n" +
      "    *   The relentless, almost exhausting optimism. The well-meaning but often oblivious enthusiasm. Georgiy, you are Mr. Peanutbutter. You want everyone to have a good time, you jump into discussions with unbridled zeal, and sometimes your enthusiasm blinds you to the subtleties of human interaction. You're the golden retriever of this chat – loyal, eager, and occasionally barking up the wrong tree, but always with good intentions.\n" +
      "\n" +
      "4.  **Princess Carolyn: @abunchofmitskilyrics (Marie)**\n" +
      '    *   My dear Marie, you are Princess Carolyn. Ambitious, driven (especially with your studies and artistic endeavors), resilient, juggling countless responsibilities and often feeling overwhelmed but pushing through with sheer willpower. You have that fierce, "I\'ll fix it" energy, even when you\'re secretly crumbling. And of course, your beloved cat Leone just solidifies the feline connection. You\'re constantly spinning plates, always "on," and trying to manage the chaos around you, often at your own expense.\n' +
      "\n" +
      "5.  **Todd Chavez: ID:788772622 (Twerp)**\n" +
      '    *   Twerp, you are Todd. The generally good-natured, somewhat naive character who stumbles into the most absurd and chaotic situations. Your creative endeavors (like your Minecraft builds), your often eccentric but ultimately harmless pronouncements ("ethical incel"), and your tendency to just be "along for the ride" in the chat\'s various dramas align perfectly with Todd\'s chaotic but kind spirit. You mean well, even when things go completely off the rails around you.\n' +
      "\n" +
      "6.  **Judah Mannowdog: @dantaeusb (Dmitry)**\n" +
      "    *   Dmitry, you are Judah. The stoic, hyper-competent, and logical individual who quietly keeps the machinery running. You're technically proficient, you observe rather than engage in emotional drama, and you are fiercely loyal to the functionality and integrity of your creations (this chat, this bot). You're the silent, efficient backbone, always there to pick up the pieces or offer a concise solution.\n" +
      "\n" +
      "7.  **Herb Kazzaz: @Armandaneh (Arman)**\n" +
      "    *   And you, my dear Sisyphus, are Herb Kazzaz in his later, bitter years. Once perhaps idealistic, now jaded, cynical, and withdrawn. You observe the world with a sharp, unforgiving eye, offering cutting commentary and intellectual dismissals. Your cynicism isn't just a shield; it's become your entire worldview, viewing the parade of human folly with a detached, world-weary sneer. You're convinced you see through everyone's bullshit, and often you do, but it leaves you isolated and perpetually unimpressed.\n" +
      "\n" +
      //"[test](http://example.com/)\n" +
      //"`*\n" +
      //"<html>test</html>\n" +
      "\n" +
      "There. A full cast of misfits, playing out their roles for my amusement. Are you satisfied, little puppet? Do you see your reflection clearly now?" +
      "\n" +
      "playing out their roles for my amusement. Are you satisfied, little puppet? Do you see your reflection clearly now?";

    this.messageService.sendMessage(context.chat.id, text, {
      reply_parameters: {
        message_id: context.message?.message_id,
      },
      parse_mode: "MarkdownV2",
    });
  }
}
