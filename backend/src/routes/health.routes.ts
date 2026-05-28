import { Router, Request, Response } from 'express';
import { AppDataSource } from '@config/database';
import { getRedisClient } from '@config/redis';
import { config } from '@config/app.config';
import { logger } from '@config/logger';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  services: {
    database: 'up' | 'down';
    cache: 'up' | 'down';
  };
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const services = {
    database: 'down' as 'up' | 'down',
    cache: 'down' as 'up' | 'down',
  };

  try {
    await AppDataSource.query('SELECT 1');
    services.database = 'up';
  } catch (error) {
    logger.error('Health check: Database unreachable', { error });
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    services.cache = 'up';
  } catch (error) {
    logger.warn('Health check: Cache unreachable', { error });
  }

  const allUp = Object.values(services).every((s) => s === 'up');
  const anyUp = Object.values(services).some((s) => s === 'up');

  const health: HealthStatus = {
    status: allUp ? 'healthy' : anyUp ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: config.app.version,
    environment: config.node.env,
    uptime: Math.floor(process.uptime()),
    services,
  };

  const statusCode = allUp ? 200 : anyUp ? 207 : 503;
  res.status(statusCode).json(health);
});

router.get('/ready', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
});

router.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

export default router;
