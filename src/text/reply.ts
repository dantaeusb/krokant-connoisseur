import { bot } from "../core/core";
import { characterService } from "../character/character.service";

// Chance to reply when merely mentioned (0..1). Always reply if message is a reply to the bot.
const REPLY_RANDOM_CHANCE = Math.min(1, Math.max(0, parseFloat(process.env.REPLY_RANDOM_CHANCE || '0.3')));

// Static trigger tokens (without @) in addition to real bot username.
const TRIGGER_USERNAMES = ['grok', 'krokantconnoisseurchatbot'];

let botId: number | null = null;
let botUsername: string | null = null;

(async () => {
    try {
        const me = await bot.telegram.getMe();
        botId = me.id;
        botUsername = me.username ? me.username.toLowerCase() : null;
    } catch (err) {
        console.error('Failed to fetch bot info for reply service:', err);
    }
})();

function buildMentionRegex(): RegExp {
    const names = [...TRIGGER_USERNAMES];
    if (botUsername && !names.includes(botUsername)) names.push(botUsername);
    const pattern = `\\b@?(?:${names.map(n => escapeRegex(n)).join('|')})\\b`;
    return new RegExp(pattern, 'i');
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function generateReply(userInput: string): Promise<string> {
    // Ensure there is at least a base system/style part.
    if (!characterService.getOrderedParts().length) {
        characterService.upsertPart({ id: 'system', text: 'You are an attentive helpful bot for a Telegram chat. Respond briefly.', priority: 0 });
    }
    const result = await characterService.execute({ userInput });
    if (result.text) return result.text.trim();
    return '👍';
}

bot.on('message', async (ctx) => {
    try {
        if (!ctx.message || !ctx.from || !ctx.chat) return;
        if (ctx.from.is_bot) return; // Avoid loops
        if (!botId) return; // Bot info not ready yet

        const text: string | undefined = (ctx.message as any).text || (ctx.message as any).caption;
        if (!text) return;

        const isReplyToBot = !!ctx. && ctx.message.reply_to_message.from && ctx.message.reply_to_message.from.id === botId;
        const mentionRegex = buildMentionRegex();
        const hasMention = mentionRegex.test(text.toLowerCase());

        const shouldReply = isReplyToBot || (hasMention && Math.random() < REPLY_RANDOM_CHANCE);
        if (!shouldReply) return;

        const replyText = await generateReply(text);

        await bot.telegram.sendMessage(ctx.chat.id, replyText, {
            reply_parameters: {
                message_id: ctx.message.message_id,
                chat_id: ctx.chat.id,
                allow_sending_without_reply: false,
            }
        });
    } catch (err) {
        console.error('Reply service error:', err);
    }
});

