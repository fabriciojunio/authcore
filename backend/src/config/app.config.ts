import { z } from 'zod';

const configSchema = z.object({
  node: z.object({
    env: z.enum(['development', 'production', 'test']).default('development'),
    port: z.coerce.number().min(1024).max(65535).default(3001),
  }),

  app: z.object({
    name: z.string().min(1),
    version: z.string().default('1.0.0'),
    apiPrefix: z.string().default('/api/v1'),
  }),

  security: z.object({
    jwt: z.object({
      accessSecret: z.string().min(64),
      refreshSecret: z.string().min(64),
      accessExpiration: z.string().default('15m'),
      refreshExpiration: z.string().default('7d'),
    }),
    bcryptRounds: z.coerce.number().min(10).max(14).default(12),
    encryptionKey: z.string().min(32),
  }),

  database: z.object({
    host: z.string(),
    port: z.coerce.number().default(5432),
    name: z.string(),
    user: z.string(),
    password: z.string(),
    poolMin: z.coerce.number().default(2),
    poolMax: z.coerce.number().default(10),
    ssl: z.coerce.boolean().default(false),
  }),

  redis: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().default(6379),
    password: z.string().optional(),
    ttl: z.coerce.number().default(3600),
  }),

  rateLimit: z.object({
    windowMs: z.coerce.number().default(900000),
    max: z.coerce.number().default(100),
    authMax: z.coerce.number().default(10),
  }),

  cors: z.object({
    allowedOrigins: z.string().transform((val) => val.split(',')),
  }),

  email: z.object({
    host: z.string(),
    port: z.coerce.number().default(587),
    secure: z.coerce.boolean().default(false),
    user: z.string(),
    password: z.string(),
    from: z.string().email(),
  }),

  upload: z.object({
    path: z.string().default('./uploads'),
    maxFileSize: z.coerce.number().default(5242880),
    allowedTypes: z.string().transform((val) => val.split(',')),
  }),

  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    dir: z.string().default('./logs'),
  }),
});

type AppConfig = z.infer<typeof configSchema>;

function loadConfig(): AppConfig {
  const parsed = configSchema.safeParse({
    node: {
      env: process.env['NODE_ENV'],
      port: process.env['PORT'],
    },
    app: {
      name: process.env['APP_NAME'],
      version: process.env['APP_VERSION'],
      apiPrefix: process.env['API_PREFIX'],
    },
    security: {
      jwt: {
        accessSecret: process.env['JWT_ACCESS_SECRET'],
        refreshSecret: process.env['JWT_REFRESH_SECRET'],
        accessExpiration: process.env['JWT_ACCESS_EXPIRATION'],
        refreshExpiration: process.env['JWT_REFRESH_EXPIRATION'],
      },
      bcryptRounds: process.env['BCRYPT_ROUNDS'],
      encryptionKey: process.env['ENCRYPTION_KEY'],
    },
    database: {
      host: process.env['DB_HOST'],
      port: process.env['DB_PORT'],
      name: process.env['DB_NAME'],
      user: process.env['DB_USER'],
      password: process.env['DB_PASSWORD'],
      poolMin: process.env['DB_POOL_MIN'],
      poolMax: process.env['DB_POOL_MAX'],
      ssl: process.env['DB_SSL'],
    },
    redis: {
      host: process.env['REDIS_HOST'],
      port: process.env['REDIS_PORT'],
      password: process.env['REDIS_PASSWORD'],
      ttl: process.env['REDIS_TTL'],
    },
    rateLimit: {
      windowMs: process.env['RATE_LIMIT_WINDOW_MS'],
      max: process.env['RATE_LIMIT_MAX'],
      authMax: process.env['AUTH_RATE_LIMIT_MAX'],
    },
    cors: {
      allowedOrigins: process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000',
    },
    email: {
      host: process.env['SMTP_HOST'],
      port: process.env['SMTP_PORT'],
      secure: process.env['SMTP_SECURE'],
      user: process.env['SMTP_USER'],
      password: process.env['SMTP_PASSWORD'],
      from: process.env['EMAIL_FROM'],
    },
    upload: {
      path: process.env['UPLOAD_PATH'],
      maxFileSize: process.env['MAX_FILE_SIZE'],
      allowedTypes: process.env['ALLOWED_FILE_TYPES'] ?? 'image/jpeg,image/png',
    },
    logging: {
      level: process.env['LOG_LEVEL'],
      dir: process.env['LOG_DIR'],
    },
  });

  if (!parsed.success) {
    throw new Error(
      `Configuration validation failed:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`
    );
  }

  return parsed.data;
}

export const config = loadConfig();
export type { AppConfig };
