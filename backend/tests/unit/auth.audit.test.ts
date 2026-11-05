import { AuthService } from '../../src/services/auth.service';
import { userRepository } from '../../src/repositories/user.repository';
import { tokenService } from '../../src/services/token.service';
import { auditService, AuditAction } from '../../src/services/audit.service';
import { User, UserStatus, UserRole } from '../../src/models/user.entity';
import { AuthenticationError } from '../../src/errors/AppError';

jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/services/token.service');
jest.mock('../../src/services/cache.service');
jest.mock('../../src/services/audit.service', () => ({
  ...jest.requireActual('../../src/services/audit.service'),
  auditService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockTokenService = tokenService as jest.Mocked<typeof tokenService>;
const record = auditService.record as jest.Mock;

const EMAIL = 'vitima@example.test';
const SENHA = 'SenhaQueNaoPodeVazar1!';

function usuario(overrides: Partial<User> = {}): User {
  return Object.assign(Object.create(User.prototype), {
    id: 'u-1',
    email: EMAIL,
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    twoFactorEnabled: false,
    comparePassword: jest.fn().mockResolvedValue(true),
    isLocked: jest.fn().mockReturnValue(false),
    isEmailVerified: jest.fn().mockReturnValue(true),
    resetFailedAttempts: jest.fn(),
    toSafeObject: jest.fn().mockReturnValue({ id: 'u-1' }),
    ...overrides,
  });
}

// O que vai para a trilha não pode conter o que a pessoa digitou.
function semDadoDigitado(): void {
  const gravado = JSON.stringify(record.mock.calls);
  expect(gravado).not.toContain(EMAIL);
  expect(gravado).not.toContain(SENHA);
}

describe('Trilha de auditoria do login', () => {
  const service = new AuthService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.completeLogin.mockResolvedValue(true);
    mockTokenService.generateTokenPair.mockReturnValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    mockTokenService.hashToken.mockReturnValue('h');
  });

  it('e-mail que não existe: falha sem usuário, com o motivo e o IP', async () => {
    mockUserRepo.findByEmailWithPassword.mockResolvedValue(null);

    await expect(service.login({ email: EMAIL, password: SENHA }, '203.0.113.7', 'Firefox'))
      .rejects.toThrow(AuthenticationError);

    expect(record).toHaveBeenCalledWith({
      action: AuditAction.LOGIN_FAILED,
      userId: null,
      details: { reason: 'unknown_user' },
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox',
    });
    semDadoDigitado();
  });

  it.each([
    ['senha errada', { comparePassword: jest.fn().mockResolvedValue(false) }, 'bad_password'],
    ['conta bloqueada', { isLocked: jest.fn().mockReturnValue(true) }, 'locked'],
    ['e-mail não verificado', { isEmailVerified: jest.fn().mockReturnValue(false) }, 'unverified'],
    ['conta inativa', { status: UserStatus.SUSPENDED }, 'inactive'],
  ])('%s: falha com o usuário e o motivo', async (_caso, overrides, motivo) => {
    mockUserRepo.findByEmailWithPassword.mockResolvedValue(usuario(overrides as Partial<User>));

    await expect(service.login({ email: EMAIL, password: SENHA }, '203.0.113.7')).rejects.toThrow();

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.LOGIN_FAILED, userId: 'u-1', details: { reason: motivo },
    }));
    semDadoDigitado();
  });

  it('código TOTP errado também fica registrado, sem o código', async () => {
    mockUserRepo.findByEmailWithPassword.mockResolvedValue(
      usuario({ twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' } as Partial<User>)
    );

    await expect(service.login({ email: EMAIL, password: SENHA, totp: '000000' }, '203.0.113.7'))
      .rejects.toThrow('Invalid two-factor code');

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ details: { reason: 'bad_totp' } }));
    expect(JSON.stringify(record.mock.calls)).not.toContain('000000');
  });

  it('login com sucesso registra o método e o IP', async () => {
    mockUserRepo.findByEmailWithPassword.mockResolvedValue(usuario());

    await service.login({ email: EMAIL, password: SENHA }, '203.0.113.7', 'Firefox');

    expect(record).toHaveBeenCalledWith({
      action: AuditAction.LOGIN,
      userId: 'u-1',
      details: { method: 'password' },
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox',
    });
    semDadoDigitado();
  });

  it('reuso do token de renovação fica registrado junto com a revogação', async () => {
    mockTokenService.verifyRefreshToken.mockReturnValue({ sub: 'u-1', sessionVersion: 0 } as never);
    mockUserRepo.findById.mockResolvedValue(usuario({ sessionVersion: 0, isActive: () => true } as Partial<User>));
    mockUserRepo.rotateRefreshToken.mockResolvedValue(false);

    await expect(service.refresh('r', { ipAddress: '198.51.100.4' })).rejects.toThrow('Invalid refresh token');

    expect(mockUserRepo.revokeSessions).toHaveBeenCalledWith('u-1');
    expect(record).toHaveBeenCalledWith({ action: AuditAction.REFRESH_REUSE, userId: 'u-1', ipAddress: '198.51.100.4' });
  });
});
