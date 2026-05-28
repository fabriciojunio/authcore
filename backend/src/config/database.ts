import { DataSource } from 'typeorm';
import { config } from './app.config';
import { logger } from './logger';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  username: config.database.user,
  password: config.database.password,
  synchronize: false, // NEVER true in production
  logging: config.node.env === 'development' ? ['error'] : false,
  entities: [__dirname + '/../models/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
  subscribers: [__dirname + '/../subscribers/**/*{.ts,.js}'],
  ssl: config.database.ssl ? { rejectUnauthorized: true } : false,
  extra: {
    max: config.database.poolMax,
    min: config.database.poolMin,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
  },
});

export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    process.exit(1);
  }
}
