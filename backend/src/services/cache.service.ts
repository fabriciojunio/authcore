import { getRedisClient } from '@config/redis';
import { config } from '@config/app.config';
import { logger } from '@config/logger';

export class CacheService {
  private prefix: string;

  constructor(prefix = 'app') {
    this.prefix = prefix;
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const value = await client.get(this.buildKey(key));
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn('Cache get error', { key, error });
      return null; // Graceful degradation
    }
  }

  async set<T>(key: string, value: T, ttl: number = config.redis.ttl): Promise<void> {
    try {
      const client = getRedisClient();
      await client.setEx(this.buildKey(key), ttl, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set error', { key, error });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const client = getRedisClient();
      await client.del(this.buildKey(key));
    } catch (error) {
      logger.warn('Cache delete error', { key, error });
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const client = getRedisClient();
      const keys = await client.keys(this.buildKey(pattern));
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      logger.warn('Cache deletePattern error', { pattern, error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.exists(this.buildKey(key));
      return result === 1;
    } catch (error) {
      logger.warn('Cache exists error', { key, error });
      return false;
    }
  }

  async increment(key: string, ttl?: number): Promise<number> {
    try {
      const client = getRedisClient();
      const builtKey = this.buildKey(key);
      const value = await client.incr(builtKey);
      if (ttl && value === 1) {
        await client.expire(builtKey, ttl);
      }
      return value;
    } catch (error) {
      logger.warn('Cache increment error', { key, error });
      return 0;
    }
  }

  // Token blacklist for invalidated JWTs
  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    await this.set(`blacklist:${token}`, true, expiresIn);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.get<boolean>(`blacklist:${token}`);
    return result === true;
  }
}

export const cacheService = new CacheService('enterprise');
