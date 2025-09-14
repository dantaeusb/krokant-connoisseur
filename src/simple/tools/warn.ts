import cron from "node-cron";
import {bot, redisClient} from "../core/core";
import {User} from "telegraf/typings/core/types/typegram";
import {Message} from "node-telegram-bot-api";
import {ExtraReplyMessage} from "telegraf/typings/telegram-types";

const WARN_LIMIT = 3;



export const getWarnings = async (userId: number) => {
    const warningKey = getWarningKey(userId);
    const warnings = await redisClient.get(warningKey);
    return parseInt(warnings || '0', 10);
};

cron.schedule('0 0 * * *', async () => {
    try {
        const keys = await redisClient.keys('user:*:warnings');
        if (keys.length > 0) {
            const pipeline = redisClient.multi();
            for (const key of keys) {
                pipeline.decr(key);
            }
            await pipeline.exec();
            console.log('Daily reset: Decremented warning counts for all users.');
        }
    } catch (err) {
        console.error('Redis error during daily warning reset:', err);
    }
});
