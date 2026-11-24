import request from 'supertest';
import type { Application } from 'express';
import { AppDataSource } from '../../src/config/database';
import { resetHealthCache } from '../../src/routes/health.routes';

const ping = jest.fn();
jest.mock('../../src/config/database', () => ({ AppDataSource: { query: jest.fn(), getRepository: jest.fn() } }));
jest.mock('../../src/config/redis', () => ({ getRedisClient: () => ({ ping: () => ping() }) }));
jest.mock('../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const query = AppDataSource.query as jest.Mock;

describe('sondas de saúde', () => {
  let app: Application;
  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    app = createApp();
  });
  beforeEach(() => {
    resetHealthCache();
    query.mockReset().mockResolvedValue([]);
    ping.mockReset().mockResolvedValue('PONG');
  });

  it('pronto com o banco no ar', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('não fica pronto sem o banco, e não conta por quê', async () => {
    query.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/10\.0|ECONN/);
  });

  it('sem o Redis degrada, mas continua pronto', async () => {
    ping.mockRejectedValue(new Error('redis fora'));
    expect((await request(app).get('/health/ready')).status).toBe(200);
    resetHealthCache();
    const geral = await request(app).get('/health');
    expect(geral.status).toBe(207);
    expect(geral.body).toMatchObject({ status: 'degraded', services: { database: 'up', cache: 'down' } });
  });

  it('banco pendurado vira não pronto em vez de segurar a sonda', async () => {
    query.mockReturnValue(new Promise(() => undefined));
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
  });

  it('não revela versão, ambiente nem tempo no ar', async () => {
    const res = await request(app).get('/health');
    expect(Object.keys(res.body).sort()).toEqual(['services', 'status', 'timestamp']);
  });

  it('a sonda não gasta o limite, e o banco não é martelado', async () => {
    for (let i = 0; i < 130; i++) {
      expect((await request(app).get('/health/ready')).status).toBe(200);
    }
    expect(query.mock.calls.length).toBeLessThan(10);
  });
});
