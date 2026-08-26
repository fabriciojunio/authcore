import { User, UserRole, UserStatus } from '../../src/models/user.entity';

/**
 * A entidade de usuário.
 *
 * Concentra três regras que valem por si: a senha nunca entra em texto claro, o
 * bloqueio por tentativas erradas, e a projeção que decide o que sai da API.
 * Nenhuma delas depende de banco, então merecem teste de unidade de verdade.
 */

function usuario(campos: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u-1',
    email: 'usuario@teste.com',
    name: 'Usuário',
    password: 'SenhaForte1!',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    ...campos,
  });
}

describe('User: senha', () => {
  it('should hash the password before it reaches the database', async () => {
    const alvo = usuario({ password: 'SenhaForte1!' });

    await alvo.hashPassword();

    expect(alvo.password).not.toBe('SenhaForte1!');
    expect(alvo.password).toMatch(/^\$2[abxy]\$/);
  });

  /**
   * O gancho roda em insert e em update. Sem esta guarda, salvar o usuário duas
   * vezes aplica bcrypt sobre o hash e a senha original deixa de valer.
   *
   * Isto já esteve quebrado: a guarda testava apenas o prefixo $2b$ enquanto o
   * bcryptjs emite $2a$, então ela nunca casava. O efeito era que gravar a
   * entidade trocava a senha do usuário sozinha, inclusive na gravação do
   * refresh token que acontece em todo login bem-sucedido: o usuário logava uma
   * vez e nunca mais entrava.
   */
  it('should not hash an already hashed password twice', async () => {
    const alvo = usuario({ password: 'SenhaForte1!' });
    await alvo.hashPassword();
    const primeiro = alvo.password;

    await alvo.hashPassword();

    expect(alvo.password).toBe(primeiro);
  });

  it('should still accept the original password after several entity saves', async () => {
    const alvo = usuario({ password: 'SenhaForte1!' });
    await alvo.hashPassword();

    // Cada gravação da entidade dispara o gancho de novo.
    await alvo.hashPassword();
    await alvo.hashPassword();

    await expect(alvo.comparePassword('SenhaForte1!')).resolves.toBe(true);
  });

  it.each(['$2a$', '$2b$', '$2y$', '$2x$'])(
    'should recognise %s as an already hashed password',
    async (prefixo) => {
      const jaProcessada = `${prefixo}12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR`;
      const alvo = usuario({ password: jaProcessada });

      await alvo.hashPassword();

      expect(alvo.password).toBe(jaProcessada);
    }
  );

  it('should leave an empty password alone rather than hashing nothing', async () => {
    const alvo = usuario({ password: '' });

    await alvo.hashPassword();

    expect(alvo.password).toBe('');
  });

  it('should accept the correct password and reject a wrong one', async () => {
    const alvo = usuario({ password: 'SenhaForte1!' });
    await alvo.hashPassword();

    await expect(alvo.comparePassword('SenhaForte1!')).resolves.toBe(true);
    await expect(alvo.comparePassword('SenhaErrada1!')).resolves.toBe(false);
  });

  /**
   * O custo fica no hash, no terceiro campo separado por cifrão. Baixar esse
   * número é a forma mais silenciosa de enfraquecer o armazenamento de senha:
   * tudo continua funcionando, só fica barato de quebrar.
   */
  it('should use a bcrypt cost of at least twelve', async () => {
    const alvo = usuario({ password: 'SenhaForte1!' });

    await alvo.hashPassword();

    const custo = Number(alvo.password.split('$')[2]);
    expect(custo).toBeGreaterThanOrEqual(12);
  });

  it('should produce a different hash for the same password (unique salt)', async () => {
    const primeiro = usuario({ password: 'SenhaForte1!' });
    const segundo = usuario({ password: 'SenhaForte1!' });

    await primeiro.hashPassword();
    await segundo.hashPassword();

    expect(primeiro.password).not.toBe(segundo.password);
  });
});

describe('User: bloqueio por tentativas', () => {
  it('should count a failed attempt without locking on the first one', () => {
    const alvo = usuario();

    alvo.incrementFailedAttempts();

    expect(alvo.failedLoginAttempts).toBe(1);
    expect(alvo.isLocked()).toBe(false);
  });

  /**
   * O bloqueio fecha na quinta tentativa, não na sexta. Errar essa fronteira
   * por um dá ao atacante uma tentativa extra por janela, para sempre.
   */
  it('should lock exactly on the fifth failed attempt', () => {
    const alvo = usuario();

    for (let i = 0; i < 4; i += 1) alvo.incrementFailedAttempts();
    expect(alvo.isLocked()).toBe(false);

    alvo.incrementFailedAttempts();
    expect(alvo.isLocked()).toBe(true);
  });

  it('should lock for fifteen minutes', () => {
    const alvo = usuario({ failedLoginAttempts: 4 });

    alvo.incrementFailedAttempts();

    const restante = alvo.lockedUntil!.getTime() - Date.now();
    expect(restante).toBeGreaterThan(14 * 60 * 1000);
    expect(restante).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('should consider a lock that already passed as expired', () => {
    const alvo = usuario({ lockedUntil: new Date(Date.now() - 1000) });

    expect(alvo.isLocked()).toBe(false);
  });

  it('should clear both the counter and the lock on a successful login', () => {
    const alvo = usuario({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60000) });

    alvo.resetFailedAttempts();

    expect(alvo.failedLoginAttempts).toBe(0);
    expect(alvo.isLocked()).toBe(false);
  });
});

describe('User: disponibilidade da conta', () => {
  it('should treat an active, unlocked account as available', () => {
    expect(usuario().isActive()).toBe(true);
  });

  it('should treat a suspended account as unavailable', () => {
    expect(usuario({ status: UserStatus.SUSPENDED }).isActive()).toBe(false);
  });

  it('should treat a pending account as unavailable', () => {
    expect(usuario({ status: UserStatus.PENDING_VERIFICATION }).isActive()).toBe(false);
  });

  /**
   * Conta ativa mas bloqueada continua indisponível. Se isActive olhasse só o
   * status, o bloqueio por tentativas erradas não impediria o acesso.
   */
  it('should treat an active but locked account as unavailable', () => {
    const alvo = usuario({ lockedUntil: new Date(Date.now() + 60000) });

    expect(alvo.status).toBe(UserStatus.ACTIVE);
    expect(alvo.isActive()).toBe(false);
  });

  it('should report email verification from the timestamp', () => {
    expect(usuario().isEmailVerified()).toBe(false);
    expect(usuario({ emailVerifiedAt: new Date() }).isEmailVerified()).toBe(true);
  });
});

describe('User: projeção segura', () => {
  /**
   * Esta é a última barreira antes da resposta HTTP. Um campo esquecido aqui
   * publica hash de senha ou segredo de 2FA numa listagem de usuários.
   */
  it('should strip every secret from the projection', () => {
    const alvo = usuario({
      password: '$2b$12$hash',
      refreshTokenHash: 'hash-do-refresh',
      twoFactorSecret: 'SEGREDO2FA',
    });

    const seguro = alvo.toSafeObject();

    expect(seguro).not.toHaveProperty('password');
    expect(seguro).not.toHaveProperty('refreshTokenHash');
    expect(seguro).not.toHaveProperty('twoFactorSecret');
  });

  it('should not leave the secrets anywhere in the serialized output', () => {
    const alvo = usuario({
      password: '$2b$12$hash',
      refreshTokenHash: 'hash-do-refresh',
      twoFactorSecret: 'SEGREDO2FA',
    });

    const texto = JSON.stringify(alvo.toSafeObject());

    expect(texto).not.toContain('$2b$12$hash');
    expect(texto).not.toContain('hash-do-refresh');
    expect(texto).not.toContain('SEGREDO2FA');
  });

  it('should keep the fields the client actually needs', () => {
    const seguro = usuario().toSafeObject();

    expect(seguro).toMatchObject({
      id: 'u-1',
      email: 'usuario@teste.com',
      name: 'Usuário',
      role: UserRole.USER,
    });
  });
});
