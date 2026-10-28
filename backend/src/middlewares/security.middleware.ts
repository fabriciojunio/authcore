import crypto from 'crypto';
import { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import hpp from 'hpp';
import compression from 'compression';
import { config } from '@config/app.config';
import { logger } from '@config/logger';
import { AppError, HttpStatus, RateLimitError } from '@errors/AppError';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(req: Request): string | undefined {
  const origin = req.headers.origin;
  if (origin) return origin;
  const referer = req.headers.referer;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF protection for routes that authenticate by cookie (refresh, logout). SameSite=Strict
 * already stops other sites, but not sibling subdomains; so a state-changing request that
 * carries cookies must also name an allowed origin. Bearer-only API clients send no cookie
 * and are not affected.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || !req.headers.cookie) return next();
  const origin = requestOrigin(req);
  if (origin && config.cors.allowedOrigins.includes(origin)) return next();
  logger.warn('Blocked cookie request without an allowed origin', { origin: origin ?? 'missing', path: req.path });
  next(new AppError('Request origin not allowed', HttpStatus.FORBIDDEN, 'CSRF_ORIGIN_REJECTED'));
}

export function applySecurityMiddleware(app: Express): void {
  // ─── Helmet: Secure HTTP headers ───────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    })
  );

  // ─── CORS ───────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // Server-to-server
        if (config.cors.allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // Denied without an error: throwing here made the API answer 500 to every request from
          // an unknown origin. With no CORS headers the browser cannot read the response, and a
          // state-changing request that carries cookies is refused by csrfProtection with 403.
          logger.warn('Blocked CORS request from unauthorized origin', { origin });
          callback(null, false);
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
      credentials: true,
      maxAge: 86400, // 24 hours preflight cache
    })
  );

  // ─── HTTP Parameter Pollution Protection ────────────────────────
  app.use(hpp());

  // ─── Compression ────────────────────────────────────────────────
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
      threshold: 1024, // Only compress responses > 1KB
    })
  );

  // ─── Global Rate Limiter ────────────────────────────────────────
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      keyGenerator: (req) => req.ip ?? 'unknown',
      handler: (_req: Request, _res: Response, next: NextFunction) => {
        next(new RateLimitError());
      },
    })
  );

  // ─── Slow Down: Gradual response delay ──────────────────────────
  app.use(
    slowDown({
      windowMs: 15 * 60 * 1000,
      delayAfter: 50,
      delayMs: (used) => (used - 50) * 100,
    })
  );

  // ─── Request ID tracking ─────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) ??
                      crypto.randomBytes(16).toString('hex');
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // ─── Remove sensitive response headers ──────────────────────────
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    next();
  });
}

export function authRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new RateLimitError('Too many authentication attempts'));
    },
  });
}
