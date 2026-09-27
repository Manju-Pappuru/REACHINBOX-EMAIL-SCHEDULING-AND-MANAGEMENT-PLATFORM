import IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const useTls = process.env.REDIS_TLS === 'true';

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

if (useTls) {
  redisOptions.tls = {};
}

export const redisConnection = new IORedis(redisUrl, redisOptions);

redisConnection.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});
