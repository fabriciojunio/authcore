import { createClient, RedisClientType } from 'redis';
import { config } from './app.config';
import { logger } from './logger';

let redisClient: RedisClientType;

export async function initializeRedis(): Promise<RedisClientType> {
  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis: Too many reconnection attempts');
          return new Error('Too many reconnection attempts');
        }
        return Math.min(retries * 100, 3000);
      },
    },
    password: config.redis.password,
  }) as RedisClientType;

  redisClient.on('error', (err: Error) => {
    logger.error('Redis Client Error', { error: err.message });
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected successfully');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis reconnecting...');
  });

  await redisClient.connect();
  return redisClient;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}
