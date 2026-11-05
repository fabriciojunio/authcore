import { AuditService, AuditAction } from '../../src/services/audit.service';
import { auditRepository } from '../../src/repositories/audit.repository';
import { logger } from '../../src/config/logger';
import type { AuditLog } from '../../src/models/audit-log.entity';

jest.mock('../../src/repositories/audit.repository');
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockRepo = auditRepository as jest.Mocked<typeof auditRepository>;

describe('AuditService', () => {
  const service = new AuditService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockResolvedValue({} as AuditLog);
  });

  it('grava a ação, o usuário, o IP e os detalhes', async () => {
    await service.record({
      action: AuditAction.LOGIN_FAILED,
      userId: 'u-1',
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox',
      details: { reason: 'bad_password' },
    });

    expect(mockRepo.create).toHaveBeenCalledWith({
      action: 'auth.login_failed',
      userId: 'u-1',
      tableName: 'users',
      recordId: 'u-1',
      newValues: { reason: 'bad_password' },
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox',
    });
  });

  it('aceita IPv6 e descarta o que não é IP, que faria a coluna INET recusar o INSERT', async () => {
    await service.record({ action: AuditAction.LOGIN, ipAddress: '::1' });
    await service.record({ action: AuditAction.LOGIN, ipAddress: 'unknown' });

    expect(mockRepo.create.mock.calls[0]![0]).toMatchObject({ ipAddress: '::1' });
    expect(mockRepo.create.mock.calls[1]![0]).toMatchObject({ ipAddress: null });
  });

  it('corta o User-Agent, que vem do cliente sem limite', async () => {
    await service.record({ action: AuditAction.LOGIN, userAgent: 'x'.repeat(5000) });

    const gravado = mockRepo.create.mock.calls[0]![0] as { userAgent: string };
    expect(gravado.userAgent).toHaveLength(300);
  });

  it('evento sem usuário (login com e-mail que não existe) fica sem tabela e sem registro', async () => {
    await service.record({ action: AuditAction.LOGIN_FAILED, details: { reason: 'unknown_user' } });

    expect(mockRepo.create.mock.calls[0]![0]).toMatchObject({ userId: null, tableName: null, recordId: null });
  });

  it('falha ao gravar não derruba quem chamou: vai para o log', async () => {
    mockRepo.create.mockRejectedValue(new Error('banco fora'));

    await expect(service.record({ action: AuditAction.LOGOUT, userId: 'u-1' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith('Audit write failed', expect.objectContaining({
      action: 'auth.logout', userId: 'u-1',
    }));
  });

  it('a listagem repassa página, limite e filtro ao repositório', async () => {
    mockRepo.list.mockResolvedValue({ data: [], meta: {} } as never);

    await service.list({ page: 2, limit: 10, action: 'auth.login' });

    expect(mockRepo.list).toHaveBeenCalledWith({ page: 2, limit: 10, action: 'auth.login' });
  });
});
