import 'dotenv/config';
import { Telegraf } from 'telegraf';
import {createClient, RedisClientType} from 'redis';

class Core {
    private static instance: Core;
    public readonly bot: Telegraf;
    public readonly redisClient: RedisClientType;
    public readonly messageLimit: number;

    private constructor() {
        const token = process.env.TELEGRAM_BOT_TOKEN;

        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN must be set');
        }

        this.bot = new Telegraf(token);

        const redisUrl = process.env.REDIS_URL;
        this.redisClient = createClient({url: redisUrl});

        this.redisClient.on('error', (err) => console.log('Redis Client Error', err));
        this.redisClient.connect().then(() => {
            console.log('Connected to Redis');
        });

        this.messageLimit = parseInt(process.env.MESSAGE_LIMIT ?? '3', 10);
    }

    public static getInstance(): Core {
        if (!Core.instance) {
            Core.instance = new Core();
        }
        return Core.instance;
    }
}

const core = Core.getInstance();
export const {bot, redisClient, messageLimit} = core;
export default core;

