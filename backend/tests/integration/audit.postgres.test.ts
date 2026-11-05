import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { AppDataSource } from '../../src/config/database';
import { UserRole, UserStatus } from '../../src/models/user.entity';
import { userRepository } from '../../src/repositories/user.repository';

const ORIGIN = process.env['ALLOWED_ORIGINS']?.split(',')[0] ?? 'http://localhost:3000';

const postgres = process.env['AUTHCORE_POSTGRES_TEST'] === '1' ? describe : describe.skip;

interface LinhaDaTrilha {
  action: string;
  new_values: Record<string, string> | null;
  ip: string | null;
  user_agent: string | null;
}

postgres('Trilha de auditoria com PostgreSQL real', () => {
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

  it('grava o login que falhou e o que passou, sem o que foi digitado, e só o admin lê', async () => {
    const senha = 'StartPassword1!';
    const errada = 'SenhaErrada123!';
    const email = `audit-${randomUUID()}@example.test`;
    const adminEmail = `admin-${randomUUID()}@example.test`;
    const pessoa = await userRepository.create({ name: 'Fabrício Júnio', email, password: senha,
      role: UserRole.USER, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });
    await userRepository.create({ name: 'Admin', email: adminEmail, password: senha,
      role: UserRole.ADMIN, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() });
    const app = createApp();
    const entrar = (e: string, p: string) => request(app).post('/api/v1/auth/login')
      .set('Origin', ORIGIN).set('User-Agent', 'teste-da-trilha').send({ email: e, password: p });

    expect((await entrar(email, errada)).status).toBe(401);
    const login = await entrar(email, senha);
    expect(login.status).toBe(200);

    const linhas: LinhaDaTrilha[] = await AppDataSource.query(
      `SELECT action, new_values, host(ip_address) AS ip, user_agent
         FROM audit_logs WHERE user_id = $1 ORDER BY created_at, action DESC`,
      [pessoa.id]
    );
    expect(linhas.map((l) => l.action)).toEqual(['auth.login_failed', 'auth.login']);
    expect(linhas[0]!.new_values).toEqual({ reason: 'bad_password' });
    expect(linhas[1]!.new_values).toEqual({ method: 'password' });
    // A coluna INET aceitou o endereço que o Express resolveu.
    expect(linhas.every((l) => l.ip !== null)).toBe(true);
    expect(linhas[0]!.user_agent).toBe('teste-da-trilha');
    expect(JSON.stringify(linhas)).not.toContain(errada);
    expect(JSON.stringify(linhas)).not.toContain(email);

    const comum = await request(app).get('/api/v1/audit')
      .set('Authorization', `Bearer ${login.body.data.accessToken as string}`);
    expect(comum.status).toBe(403);

    const admin = await entrar(adminEmail, senha);
    const lista = await request(app).get('/api/v1/audit?action=auth.login_failed&limit=100')
      .set('Authorization', `Bearer ${admin.body.data.accessToken as string}`);
    expect(lista.status).toBe(200);
    const doTeste = (lista.body.data as Array<{ userId: string; actor: string; action: string }>)
      .filter((d) => d.userId === pessoa.id);
    expect(doTeste).toEqual([expect.objectContaining({ action: 'auth.login_failed', actor: email })]);
  });
});
