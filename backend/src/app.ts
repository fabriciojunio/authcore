import 'dotenv/config';
import 'express-async-errors';
import 'reflect-metadata';
import express from 'express';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { config } from '@config/app.config';
import { applySecurityMiddleware } from '@middlewares/security.middleware';
import { requestLogger } from '@middlewares/logger.middleware';
import { errorHandler, notFoundHandler } from '@middlewares/error.middleware';
import { sanitizeBody } from '@middlewares/validation.middleware';
import { swaggerSpec } from '@config/swagger';
import authRoutes from '@routes/auth.routes';
import userRoutes from '@routes/user.routes';
import productRoutes from '@routes/product.routes';
import healthRoutes from '@routes/health.routes';
import { logger } from '@config/logger';

export function createApp(): express.Application {
  const app = express();

  // ─── Trust proxy (needed for rate limiting behind reverse proxy) ─
  app.set('trust proxy', 1);

  // ─── Security middleware ─────────────────────────────────────────
  applySecurityMiddleware(app);

  // ─── Body parsing ────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' })); // Limit body size
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use(cookieParser());

  // ─── Global sanitization ─────────────────────────────────────────
  app.use(sanitizeBody);

  // ─── Request logging ─────────────────────────────────────────────
  app.use(requestLogger);

  // ─── API Documentation (development only) ────────────────────────
  if (config.node.env !== 'production') {
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: `${config.app.name} API Docs`,
      })
    );
    logger.info(`API Docs available at /api-docs`);
  }

  // ─── Routes ──────────────────────────────────────────────────────
  app.use('/health', healthRoutes);
  app.use(`${config.app.apiPrefix}/auth`, authRoutes);
  app.use(`${config.app.apiPrefix}/users`, userRoutes);
  app.use(`${config.app.apiPrefix}/products`, productRoutes);

  // ─── 404 Handler ─────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── Global Error Handler (must be last) ─────────────────────────
  app.use(errorHandler);

  return app;
}
