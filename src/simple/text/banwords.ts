import {bot, redisClient} from "../core/core";

const BANNED_PATTERNS = [
    "badword1",
    /badword2/i,
    "badword3"
];

const containsBannedWords = (messageText: string): boolean => {
    return BANNED_PATTERNS.some(pattern => {
        if (typeof pattern === "string") {
            // Plain string matching (case-insensitive)
            return messageText.toLowerCase().includes(pattern.toLowerCase());
        } else if (pattern instanceof RegExp) {
            // Regex matching
            return pattern.test(messageText);
        }
        return false;
    });
};

bot.on('message', async (message) => {
    if (!message.from || !message.text) {
        return;
    }

    const chatId = message.chat.id;
    const userId = message.from.id;
    const userKey = `user:${userId}:banned_words`;

    if (containsBannedWords(message.text)) {
        try {
            const currentCount = await redisClient.incr(userKey);

            if (currentCount > 3) { // Example limit for banned words
                bot.sendMessage(chatId, `Warning: ${message.from.first_name}, you have used banned words multiple times. Please adhere to the rules.`);
            }
        } catch (err) {
            console.error('Redis error:', err);
        }
    }
});
