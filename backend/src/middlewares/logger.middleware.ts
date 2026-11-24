import { Request, Response, NextFunction } from 'express';
import { logger } from '@config/logger';

// O User-Agent vem do cliente sem limite.
const MAX_USER_AGENT = 300;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  // Sem a consulta: token de verificação e código chegam na query, e log não é cofre.
  const path = req.originalUrl.split('?', 1)[0];

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, MAX_USER_AGENT),
      contentLength: res.get('content-length'),
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}
