import 'dotenv/config';
import { createApp } from './app';
import { initializeDatabase } from './config/database';
import { initializeRedis, closeRedis } from './config/redis';
import { config } from './config/app.config';
import { logger } from './config/logger';

async function bootstrap(): Promise<void> {
  try {
    logger.info(`Starting ${config.app.name} v${config.app.version}...`);
    logger.info(`Environment: ${config.node.env}`);

    // Initialize database connection
    await initializeDatabase();

    // Initialize Redis connection
    await initializeRedis();

    // Create and start Express app
    const app = createApp();
    const server = app.listen(config.node.port, () => {
      logger.info(`Server running on port ${config.node.port}`);
      logger.info(`API Base: http://localhost:${config.node.port}${config.app.apiPrefix}`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        await closeRedis();
        logger.info('Redis connection closed');

        const { AppDataSource } = await import('./config/database');
        if (AppDataSource.isInitialized) {
          await AppDataSource.destroy();
          logger.info('Database connection closed');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception - shutting down', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled Rejection - shutting down', { reason });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

bootstrap();
