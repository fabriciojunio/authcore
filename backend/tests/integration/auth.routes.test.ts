import request from 'supertest';
import type { Application } from 'express';

// Mock database and redis before importing app
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
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
  }),
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('Auth Routes Integration', () => {
  let app: Application;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    app = createApp();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should return 422 for invalid data', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'A',
        email: 'not-an-email',
        password: 'weak',
        confirmPassword: 'weak',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 422 when passwords do not match', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Test User',
        email: 'test@test.com',
        password: 'SecurePass123!',
        confirmPassword: 'DifferentPass123!',
      });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 422 for missing fields', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('accepts an empty body when the refresh token is in a cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', 'refreshToken=invalid-token')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('CSRF protection on cookie requests', () => {
    it('rejects a cookie request from an origin that is not allowed', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://attacker.example')
        .set('Cookie', 'refreshToken=stolen-context')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('rejects a cookie request that names no origin at all', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refreshToken=stolen-context')
        .send({});

      expect(res.status).toBe(403);
    });

    it('accepts the allowed origin given only by the Referer header', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Referer', 'http://localhost:3000/dashboard')
        .set('Cookie', 'refreshToken=invalid-token')
        .send({});

      expect(res.status).toBe(401);
    });

    it('leaves bearer-only clients without cookies alone', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 without authorization header', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');
      expect([200, 207, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('services');
    });

    it('should return ready status', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('Security headers', () => {
    it('should include security headers', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should not expose X-Powered-By header', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
