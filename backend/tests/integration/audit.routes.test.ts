import request from 'supertest';
import type { Application } from 'express';

jest.mock('../../src/config/database', () => ({
  AppDataSource: {
    initialize: jest.fn(),
    isInitialized: true,
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    }),
  },
  initializeDatabase: jest.fn(),
}));

jest.mock('../../src/config/redis', () => ({
  initializeRedis: jest.fn(),
  getRedisClient: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn().mockResolvedValue(0),
    ping: jest.fn().mockResolvedValue('PONG'),
    keys: jest.fn().mockResolvedValue([]),
    scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
  }),
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ADMIN = '44444444-4444-4444-8444-444444444444';
const COMUM = '55555555-5555-4555-8555-555555555555';

describe('Trilha de auditoria pela API', () => {
  let app: Application;
  let tokenFor: (id: string) => string;
  let listar: jest.SpyInstance;
  let prepararRepositorios: () => void;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    const { tokenService } = await import('../../src/services/token.service');
    const { userRepository } = await import('../../src/repositories/user.repository');
    const { auditRepository } = await import('../../src/repositories/audit.repository');
    const { UserRole } = await import('../../src/models/user.entity');

    const papeis: Record<string, string> = { [ADMIN]: UserRole.ADMIN, [COMUM]: UserRole.USER };
    const linha = (id: string) => ({
      id,
      email: `${id.slice(0, 4)}@test.local`,
      role: papeis[id],
      sessionVersion: 0,
      isActive: () => true,
      toSafeObject() {
        return { id: this.id, email: this.email, role: this.role };
      },
    });

    prepararRepositorios = () => {
      jest.spyOn(userRepository, 'findById').mockImplementation(async (id: string) =>
        (papeis[id] ? linha(id) : null) as never);
      listar = jest.spyOn(auditRepository, 'list').mockResolvedValue({
        data: [{
          id: 'a-1',
          action: 'auth.login_failed',
          userId: COMUM,
          user: { email: 'comum@test.local' },
          ipAddress: '203.0.113.7',
          newValues: { reason: 'bad_password' },
          oldValues: null,
          createdAt: new Date('2026-11-02T12:00:00Z'),
        }],
        meta: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false },
      } as never);
    };

    tokenFor = (id: string) =>
      tokenService.generateTokenPair({ sub: id, email: linha(id).email, role: papeis[id] as never, sessionVersion: 0 })
        .accessToken;
    app = createApp();
  });

  beforeEach(() => prepararRepositorios());

  it('sem token responde 401', async () => {
    const res = await request(app).get('/api/v1/audit');
    expect(res.status).toBe(401);
    expect(listar).not.toHaveBeenCalled();
  });

  it('usuário comum não lê a trilha: 403', async () => {
    const res = await request(app).get('/api/v1/audit').set('Authorization', `Bearer ${tokenFor(COMUM)}`);
    expect(res.status).toBe(403);
    expect(listar).not.toHaveBeenCalled();
  });

  it('administrador lê, com o e-mail de quem agiu e sem os valores antigos', async () => {
    const res = await request(app).get('/api/v1/audit').set('Authorization', `Bearer ${tokenFor(ADMIN)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{
      id: 'a-1',
      action: 'auth.login_failed',
      userId: COMUM,
      actor: 'comum@test.local',
      ipAddress: '203.0.113.7',
      details: { reason: 'bad_password' },
      createdAt: '2026-11-02T12:00:00.000Z',
    }]);
    expect(listar).toHaveBeenCalledWith({ page: 1, limit: 50, action: undefined });
  });

  it('filtra por ação conhecida e limita a página a 100', async () => {
    const res = await request(app)
      .get('/api/v1/audit?action=auth.login_failed&limit=5000&page=2')
      .set('Authorization', `Bearer ${tokenFor(ADMIN)}`);

    expect(res.status).toBe(200);
    expect(listar).toHaveBeenCalledWith({ page: 2, limit: 100, action: 'auth.login_failed' });
  });

  it('ação que a aplicação não grava é recusada antes da consulta', async () => {
    const res = await request(app)
      .get("/api/v1/audit?action=auth.login' OR '1'='1")
      .set('Authorization', `Bearer ${tokenFor(ADMIN)}`);

    // 422 é como o projeto responde a ValidationError.
    expect(res.status).toBe(422);
    expect(listar).not.toHaveBeenCalled();
  });
});
