import { bot } from "../core/core";
import { warnUser } from "../tools/warn";
import { Context } from "telegraf";

const isUserAdmin = async (ctx: Context): Promise<boolean> => {
    if (!ctx.chat || ctx.chat.type === 'private' || !ctx.from) {
        return true;
    }
    const administrators = await ctx.getChatAdministrators();
    return administrators.some(admin => admin.user.id === ctx.from.id);
};

bot.command('warn', async (ctx) => {
    if (!ctx.from) return;

    if (!await isUserAdmin(ctx)) {
        ctx.reply("You don't have permission to use this command.");
        return;
    }

    const replyToMessage = (ctx.message as any).reply_to_message;

    if (!replyToMessage || !replyToMessage.from) {
        ctx.reply("Please reply to a user's message to warn them.");
        return;
    }

    const targetUser = replyToMessage.from;
    const reason = ctx.message.text?.split(' ').slice(1).join(' ') || 'No reason specified';

    await warnUser(targetUser, ctx.chat.id, reason);
});