import { promises as fs } from 'fs';
import path from 'path';
import request from 'supertest';
import sharp from 'sharp';
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

// Two plain users and a manager. Tokens are signed by the real token service, so the request
// goes through the same authentication any client would.
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MARIA = '33333333-3333-4333-8333-333333333333';
const ALICE_PRODUCT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Ownership between users (IDOR/BOLA)', () => {
  let app: Application;
  let tokenFor: (id: string) => string;
  let mockRepositories: () => void;
  let productUpdate: jest.SpyInstance;
  let productDelete: jest.SpyInstance;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    const { tokenService } = await import('../../src/services/token.service');
    const { userRepository } = await import('../../src/repositories/user.repository');
    const { productRepository } = await import('../../src/repositories/product.repository');
    const { UserRole } = await import('../../src/models/user.entity');

    const roles: Record<string, string> = { [ALICE]: UserRole.USER, [BOB]: UserRole.USER, [MARIA]: UserRole.MANAGER };
    const userRow = (id: string) => ({
      id,
      email: `${id.slice(0, 4)}@test.local`,
      role: roles[id],
      sessionVersion: 0,
      isActive: () => true,
      toSafeObject() {
        return { id: this.id, email: this.email, role: this.role };
      },
    });

    // jest.config restores every spy before each test, so they are recreated there.
    mockRepositories = () => {
      jest.spyOn(userRepository, 'findById').mockImplementation(async (id: string) =>
        (roles[id] ? userRow(id) : null) as never);
      jest.spyOn(productRepository, 'findById').mockImplementation(async (id: string) =>
        (id === ALICE_PRODUCT ? { id, name: 'Caneca', status: 'active', createdById: ALICE } : null) as never);
      productUpdate = jest.spyOn(productRepository, 'update').mockImplementation(async (id: string, dto: object) =>
        ({ id, createdById: ALICE, ...dto }) as never);
      productDelete = jest.spyOn(productRepository, 'softDelete').mockResolvedValue(undefined as never);
    };

    tokenFor = (id: string) =>
      tokenService.generateTokenPair({ sub: id, email: userRow(id).email, role: roles[id] as never, sessionVersion: 0 })
        .accessToken;
    app = createApp();
  });

  beforeEach(() => mockRepositories());

  it("refuses to let one user edit another user's product", async () => {
    const res = await request(app)
      .patch(`/api/v1/products/${ALICE_PRODUCT}`)
      .set('Authorization', `Bearer ${tokenFor(BOB)}`)
      .send({ name: 'Trocado pelo Bob' });

    expect(res.status).toBe(403);
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("refuses to let one user delete another user's product", async () => {
    const res = await request(app)
      .delete(`/api/v1/products/${ALICE_PRODUCT}`)
      .set('Authorization', `Bearer ${tokenFor(BOB)}`);

    expect(res.status).toBe(403);
    expect(productDelete).not.toHaveBeenCalled();
  });

  it('lets the owner rename their product without touching its status', async () => {
    const res = await request(app)
      .patch(`/api/v1/products/${ALICE_PRODUCT}`)
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`)
      .send({ name: 'Caneca azul' });

    expect(res.status).toBe(200);
    expect(productUpdate).toHaveBeenCalledWith(ALICE_PRODUCT, { name: 'Caneca azul' });
  });

  it("refuses an image upload to another user's product and keeps nothing on disk", async () => {
    const { config } = await import('../../src/config/app.config');
    const folder = path.resolve(config.upload.path);
    await fs.mkdir(folder, { recursive: true });
    const before = await fs.readdir(folder);
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#a33' } }).png().toBuffer();

    const res = await request(app)
      .post(`/api/v1/products/${ALICE_PRODUCT}/image`)
      .set('Authorization', `Bearer ${tokenFor(BOB)}`)
      .attach('image', png, { filename: 'foto.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
    expect(productUpdate).not.toHaveBeenCalled();
    expect(await fs.readdir(folder)).toEqual(before);
  });

  it('keeps a plain user out of the user directory and of other profiles', async () => {
    const list = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${tokenFor(BOB)}`);
    const other = await request(app).get(`/api/v1/users/${ALICE}`).set('Authorization', `Bearer ${tokenFor(BOB)}`);

    expect(list.status).toBe(403);
    expect(other.status).toBe(403);
  });

  it("does not let a manager read another user's profile", async () => {
    const res = await request(app).get(`/api/v1/users/${ALICE}`).set('Authorization', `Bearer ${tokenFor(MARIA)}`);

    expect(res.status).toBe(403);
  });

  it('answers the profile route with the caller, whatever id the query carries', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .query({ id: ALICE })
      .set('Authorization', `Bearer ${tokenFor(BOB)}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(BOB);
    expect(JSON.stringify(res.body)).not.toContain(ALICE);
  });
});
