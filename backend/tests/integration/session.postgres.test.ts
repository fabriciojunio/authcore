import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Request, Response } from 'express';
import { AppDataSource } from '../../src/config/database';
import { authenticate } from '../../src/middlewares/auth.middleware';
import { UserRole, UserStatus } from '../../src/models/user.entity';
import { userRepository } from '../../src/repositories/user.repository';
import { authService } from '../../src/services/auth.service';
import { tokenService } from '../../src/services/token.service';
import { userService } from '../../src/services/user.service';

// Browsers always send Origin on these requests, and the API refuses cookie requests without it.
const ORIGIN = process.env['ALLOWED_ORIGINS']?.split(',')[0] ?? 'http://localhost:3000';

const postgres = process.env['AUTHCORE_POSTGRES_TEST'] === '1' ? describe : describe.skip;

postgres('Sessões com PostgreSQL real', () => {
  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'enterprise_test') {
      throw new Error('Este teste exige o banco isolado enterprise_test');
    }
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('entrega o contrato HTTP de login e renova pelo cookie sem expor refresh no JSON', async () => {
    const email = `http-${randomUUID()}@example.test`;
    await userRepository.create({ name: 'Fabrício Júnio', email, password: 'StartPassword1!',
      role: UserRole.USER, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });
    const app = createApp();
    const browser = request.agent(app);
    const login = await browser.post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password: 'StartPassword1!' });
    expect(login.status).toBe(200);
    expect(login.body.data).toEqual({
      user: expect.objectContaining({ email, name: 'Fabrício Júnio' }),
      accessToken: expect.any(String), expiresIn: expect.any(Number),
    });
    expect(JSON.stringify(login.body)).not.toContain('refreshToken');
    expect(JSON.stringify(login.body)).not.toContain('refreshTokenHash');
    const cookie = login.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toContain('HttpOnly');
    expect(cookie[0]).toContain('SameSite=Strict');
    expect(cookie[0]).toContain('Path=/api/v1/auth/refresh');

    const refresh = await browser.post('/api/v1/auth/refresh').set('Origin', ORIGIN).send({});
    expect(refresh.status).toBe(200);
    expect(refresh.body.data).toEqual({ accessToken: expect.any(String), expiresIn: expect.any(Number) });
    expect(refresh.body.data.accessToken).not.toBe(login.body.data.accessToken);
    const bearer = `Bearer ${refresh.body.data.accessToken}`;
    expect((await browser.get('/api/v1/auth/me').set('Authorization', bearer)).status).toBe(200);
    expect((await browser.post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Authorization', bearer).send({})).status).toBe(200);
    expect((await browser.get('/api/v1/auth/me').set('Authorization', bearer)).status).toBe(401);
    expect((await browser.post('/api/v1/auth/refresh').set('Origin', ORIGIN).send({})).status).toBe(401);
  });

  it('aceita nome acentuado e mantém cadastro HTTP pendente sem tokens', async () => {
    const email = `register-${randomUUID()}@example.test`;
    const app = createApp();
    const body = { name: 'Fabrício Júnio', email, password: 'StartPassword1!', confirmPassword: 'StartPassword1!' };
    const first = await request(app).post('/api/v1/auth/register').send(body);
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({ message: expect.any(String) });
    expect(first.headers['set-cookie']).toBeUndefined();
    const user = await userRepository.findByEmail(email);
    expect(user?.name).toBe('Fabrício Júnio');
    expect(user?.status).toBe(UserStatus.PENDING_VERIFICATION);
    const duplicate = await request(app).post('/api/v1/auth/register').send(body);
    expect(duplicate.status).toBe(first.status);
    expect(duplicate.body).toEqual(first.body);
    expect((await request(app).post('/api/v1/auth/login').send({ email, password: body.password })).status).toBe(401);
  });

  async function assertRevoked(accessToken: string): Promise<void> {
    const request = { headers: { authorization: `Bearer ${accessToken}` } } as Request;
    await expect(authenticate(request, {} as Response, jest.fn())).rejects.toThrow('Token has been revoked');
  }

  it('gira refresh uma vez e revoga acesso após reuso, senha e logout', async () => {
    const email = `audit-${randomUUID()}@example.test`;
    const user = await userRepository.create({
      name: 'Audit User',
      email,
      password: 'StartPassword1!',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    const publicLookup = await userRepository.findById(user.id);
    expect(publicLookup).not.toHaveProperty('password');
    expect(publicLookup).not.toHaveProperty('refreshTokenHash');
    expect(publicLookup).not.toHaveProperty('passwordResetToken');

    const first = await authService.login({ email, password: 'StartPassword1!' }, '127.0.0.1');
    expect((await userRepository.findByEmailWithPassword(email))?.refreshTokenHash)
      .toBe(tokenService.hashToken(first.tokens.refreshToken));

    const rotated = await authService.refresh(first.tokens.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.tokens.refreshToken);
    await expect(authService.refresh(first.tokens.refreshToken)).rejects.toThrow('Invalid refresh token');
    expect((await userRepository.findByEmailWithPassword(email))?.refreshTokenHash).toBeNull();
    await assertRevoked(first.tokens.accessToken);

    const second = await authService.login({ email, password: 'StartPassword1!' }, '127.0.0.1');
    await userService.changePassword(user.id, {
      currentPassword: 'StartPassword1!',
      newPassword: 'NextPassword2!',
    });
    expect((await userRepository.findByEmailWithPassword(email))?.refreshTokenHash).toBeNull();
    await assertRevoked(second.tokens.accessToken);
    await expect(authService.refresh(second.tokens.refreshToken)).rejects.toThrow('Invalid refresh token');

    const third = await authService.login({ email, password: 'NextPassword2!' }, '127.0.0.1');
    await authService.logout(user.id, third.tokens.refreshToken);
    expect((await userRepository.findByEmailWithPassword(email))?.refreshTokenHash).toBeNull();
    await assertRevoked(third.tokens.accessToken);
  });

  it('consome um refresh apenas uma vez mesmo em requisições concorrentes', async () => {
    const email = `refresh-${randomUUID()}@example.test`;
    await userRepository.create({ name: 'Refresh User', email, password: 'StartPassword1!',
      role: UserRole.USER, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });
    const login = await authService.login({ email, password: 'StartPassword1!' }, '127.0.0.1');

    const results = await Promise.allSettled([
      authService.refresh(login.tokens.refreshToken), authService.refresh(login.tokens.refreshToken),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await assertRevoked(login.tokens.accessToken);
    expect((await userRepository.findByEmailWithPassword(email))?.refreshTokenHash).toBeNull();
  });

  it('não deixa login nem falha de login restaurarem uma senha alterada após a leitura', async () => {
    const email = `race-${randomUUID()}@example.test`;
    const user = await userRepository.create({ name: 'Race User', email, password: 'StartPassword1!',
      role: UserRole.USER, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });
    const stale = await userRepository.findByEmailWithPassword(email);
    await userService.changePassword(user.id, {
      currentPassword: 'StartPassword1!', newPassword: 'NextPassword2!',
    });

    const read = jest.spyOn(userRepository, 'findByEmailWithPassword');
    read.mockResolvedValueOnce(stale);
    await expect(authService.login({ email, password: 'StartPassword1!' }, '127.0.0.1'))
      .rejects.toThrow('Credentials changed');
    read.mockResolvedValueOnce(stale);
    await expect(authService.login({ email, password: 'WrongPassword3!' }, '127.0.0.1'))
      .rejects.toThrow('Invalid credentials');
    read.mockRestore();

    const persisted = await userRepository.findByEmailWithPassword(email);
    expect(await persisted!.comparePassword('NextPassword2!')).toBe(true);
    expect(await persisted!.comparePassword('StartPassword1!')).toBe(false);
    expect(persisted!.sessionVersion).toBe(1);
    expect(persisted!.failedLoginAttempts).toBe(0);
  });

  it('permite apenas uma troca concorrente com a mesma senha anterior', async () => {
    const email = `password-${randomUUID()}@example.test`;
    const user = await userRepository.create({ name: 'Password User', email, password: 'StartPassword1!',
      role: UserRole.USER, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });

    const results = await Promise.allSettled([
      userService.changePassword(user.id, { currentPassword: 'StartPassword1!', newPassword: 'NextPassword2!' }),
      userService.changePassword(user.id, { currentPassword: 'StartPassword1!', newPassword: 'OtherPassword3!' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const persisted = await userRepository.findByEmailWithPassword(email);
    expect(persisted!.sessionVersion).toBe(1);
    expect(persisted!.refreshTokenHash).toBeNull();
  });
});
