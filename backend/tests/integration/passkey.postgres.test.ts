import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { AppDataSource } from '../../src/config/database';
import { UserRole, UserStatus } from '../../src/models/user.entity';
import { Passkey } from '../../src/models/passkey.entity';
import { userRepository } from '../../src/repositories/user.repository';
import { ORIGIN, SoftwareAuthenticator } from '../helpers/softwareAuthenticator';

const postgres = process.env['AUTHCORE_POSTGRES_TEST'] === '1' ? describe : describe.skip;

postgres('Passkeys com PostgreSQL e Redis reais', () => {
  const app = createApp();

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

  async function contaComLogin(): Promise<{ id: string; bearer: string }> {
    const email = `passkey-${randomUUID()}@example.test`;
    const user = await userRepository.create({ name: 'Fabrício Júnio', email, password: 'StartPassword1!',
      role: UserRole.USER, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });
    const login = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN)
      .send({ email, password: 'StartPassword1!' });
    expect(login.status).toBe(200);
    return { id: user.id, bearer: `Bearer ${login.body.data.accessToken as string}` };
  }

  async function cadastrar(bearer: string, authenticator: SoftwareAuthenticator): Promise<string> {
    const options = await request(app).post('/api/v1/auth/passkeys/registration/options')
      .set('Origin', ORIGIN).set('Authorization', bearer).send({});
    expect(options.status).toBe(200);
    const verify = await request(app).post('/api/v1/auth/passkeys/registration/verify')
      .set('Origin', ORIGIN).set('Authorization', bearer)
      .send({ name: 'Notebook', response: authenticator.register(options.body.data.challenge as string) });
    expect(verify.status).toBe(201);
    return verify.body.data.id as string;
  }

  async function entrar(authenticator: SoftwareAuthenticator) {
    const options = await request(app).post('/api/v1/auth/passkeys/authentication/options').set('Origin', ORIGIN).send({});
    expect(options.status).toBe(200);
    const { flowId, options: { challenge } } = options.body.data as { flowId: string; options: { challenge: string } };
    const response = authenticator.assert(challenge);
    const resultado = await request(app).post('/api/v1/auth/passkeys/authentication/verify')
      .set('Origin', ORIGIN).send({ flowId, response });
    return { resultado, flowId, response };
  }

  it('cadastra uma passkey e entra com ela sem senha, uma vez por desafio', async () => {
    const conta = await contaComLogin();
    const authenticator = new SoftwareAuthenticator(conta.id);
    const passkeyId = await cadastrar(conta.bearer, authenticator);

    const { resultado, flowId, response } = await entrar(authenticator);
    expect(resultado.status).toBe(200);
    expect(resultado.body.data).toEqual({
      user: expect.objectContaining({ id: conta.id }),
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
    });
    const cookie = resultado.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toContain('HttpOnly');
    expect(cookie[0]).toContain('SameSite=Strict');
    expect(JSON.stringify(resultado.body)).not.toContain('refreshToken');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${resultado.body.data.accessToken as string}`);
    expect(me.status).toBe(200);

    // A mesma asserção de novo: o desafio já saiu do Redis.
    const replay = await request(app).post('/api/v1/auth/passkeys/authentication/verify')
      .set('Origin', ORIGIN).send({ flowId, response });
    expect(replay.status).toBe(401);

    const salva = await AppDataSource.getRepository(Passkey).findOneByOrFail({ id: passkeyId });
    expect(salva.lastUsedAt).toBeInstanceOf(Date);
    expect(salva.userId).toBe(conta.id);
  });

  it('não deixa um usuário ver nem apagar a passkey de outro (IDOR)', async () => {
    const dono = await contaComLogin();
    const intruso = await contaComLogin();
    const authenticator = new SoftwareAuthenticator(dono.id);
    const passkeyId = await cadastrar(dono.bearer, authenticator);

    const listaDoIntruso = await request(app).get('/api/v1/auth/passkeys').set('Authorization', intruso.bearer);
    expect(listaDoIntruso.status).toBe(200);
    expect(listaDoIntruso.body.data).toEqual([]);

    const apagar = await request(app).delete(`/api/v1/auth/passkeys/${passkeyId}`)
      .set('Origin', ORIGIN).set('Authorization', intruso.bearer);
    expect(apagar.status).toBe(404);
    expect(await AppDataSource.getRepository(Passkey).countBy({ id: passkeyId })).toBe(1);

    const listaDoDono = await request(app).get('/api/v1/auth/passkeys').set('Authorization', dono.bearer);
    expect(listaDoDono.body.data).toEqual([expect.objectContaining({ id: passkeyId, name: 'Notebook' })]);
    expect(JSON.stringify(listaDoDono.body)).not.toContain('publicKey');
  });

  it('para de aceitar a passkey depois que o dono a remove', async () => {
    const conta = await contaComLogin();
    const authenticator = new SoftwareAuthenticator(conta.id);
    const passkeyId = await cadastrar(conta.bearer, authenticator);

    const apagar = await request(app).delete(`/api/v1/auth/passkeys/${passkeyId}`)
      .set('Origin', ORIGIN).set('Authorization', conta.bearer);
    expect(apagar.status).toBe(204);

    const { resultado } = await entrar(authenticator);
    expect(resultado.status).toBe(401);
  });

  it('exige login para cadastrar e valida o formato antes de chegar ao serviço', async () => {
    const semLogin = await request(app).post('/api/v1/auth/passkeys/registration/options').set('Origin', ORIGIN).send({});
    expect(semLogin.status).toBe(401);

    const conta = await contaComLogin();
    const idInvalido = await request(app).delete('/api/v1/auth/passkeys/nao-e-uuid')
      .set('Origin', ORIGIN).set('Authorization', conta.bearer);
    expect(idInvalido.status).toBe(422);

    const lixo = await request(app).post('/api/v1/auth/passkeys/authentication/verify')
      .set('Origin', ORIGIN).send({ flowId: randomUUID(), response: { id: '<script>', type: 'public-key' } });
    expect(lixo.status).toBe(422);
  });
});
