import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const LOG_DIR = process.env['LOG_DIR'] ?? './logs';
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

// Mask sensitive fields in log output
const maskSensitiveData = winston.format((info) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'creditCard'];
  const masked = { ...info } as Record<string, unknown>;

  sensitiveKeys.forEach((key) => {
    if (masked[key]) masked[key] = '[REDACTED]';
    const data = masked['data'];
    if (data && typeof data === 'object' && (data as Record<string, unknown>)[key]) {
      masked['data'] = { ...(data as Record<string, unknown>), [key]: '[REDACTED]' };
    }
  });

  return masked as winston.Logform.TransformableInfo;
});

// File transports with rotation
const fileTransports = [
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxFiles: '30d',
    maxSize: '20m',
    zippedArchive: true,
    format: combine(timestamp(), errors({ stack: true }), maskSensitiveData(), json()),
  }),
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    maxSize: '20m',
    zippedArchive: true,
    format: combine(timestamp(), errors({ stack: true }), maskSensitiveData(), json()),
  }),
];

// Console transport for development only
const consoleTransport = new winston.transports.Console({
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
  ),
});

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  silent: false,
  transports: [
    ...fileTransports,
    // ONLY show console logs in development
    ...(IS_PRODUCTION ? [] : [consoleTransport]),
  ],
  // Prevent unhandled exceptions from crashing the process
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

// Override console methods in production to prevent data leaks
if (IS_PRODUCTION) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  console.trace = noop;
  // Keep console.error but redirect to logger
  console.error = (...args: unknown[]) => {
    logger.error(args.map(String).join(' '));
  };
}
