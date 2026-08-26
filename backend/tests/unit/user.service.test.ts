import { UserService } from '../../src/services/user.service';
import { userRepository } from '../../src/repositories/user.repository';
import { cacheService } from '../../src/services/cache.service';
import { UserRole } from '../../src/models/user.entity';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../../src/errors/AppError';

jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/services/cache.service');

/**
 * Regras de conta.
 *
 * O que precisa estar cravado aqui é quem pode ver e mudar o quê. Uma falha de
 * autorização neste arquivo não derruba nada: só deixa um usuário ler o perfil
 * do outro, em silêncio.
 */
describe('UserService', () => {
  const service = new UserService();

  function usuario(campos: Record<string, unknown> = {}) {
    return {
      id: 'u-1',
      email: 'usuario@teste.com',
      name: 'Usuário',
      role: UserRole.USER,
      toSafeObject: () => ({ id: 'u-1', email: 'usuario@teste.com', name: 'Usuário' }),
      comparePassword: jest.fn().mockResolvedValue(true),
      ...campos,
    };
  }

  beforeEach(() => {
    jest.mocked(cacheService.get).mockResolvedValue(null);
    jest.mocked(cacheService.set).mockResolvedValue(undefined);
    jest.mocked(cacheService.delete).mockResolvedValue(undefined);
  });

  describe('getProfile', () => {
    it('should answer from cache without touching the database', async () => {
      jest.mocked(cacheService.get).mockResolvedValue(usuario() as never);

      await service.getProfile('u-1');

      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('should load from the database and warm the cache on a miss', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(usuario() as never);

      await service.getProfile('u-1');

      expect(cacheService.set).toHaveBeenCalledWith(
        'user:u-1',
        { id: 'u-1', email: 'usuario@teste.com', name: 'Usuário' },
        300
      );
    });

    /**
     * O que vai para o cache é o objeto seguro, e não a entidade. Guardar a
     * entidade colocaria o hash da senha no Redis.
     */
    it('should never cache the raw entity', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(
        usuario({ password: '$2b$12$hash' }) as never
      );

      await service.getProfile('u-1');

      const [, guardado] = jest.mocked(cacheService.set).mock.calls[0]!;
      expect(guardado).not.toHaveProperty('password');
    });

    it('should report a missing user as not found', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(null as never);

      await expect(service.getProfile('u-nao-existe')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    beforeEach(() => {
      jest.mocked(userRepository.findById).mockResolvedValue(usuario() as never);
      jest.mocked(userRepository.update).mockResolvedValue(usuario() as never);
    });

    it('should trim the name before storing it', async () => {
      await service.updateProfile('u-1', { name: '  Fabrício  ' });

      expect(userRepository.update).toHaveBeenCalledWith('u-1', { name: 'Fabrício' });
    });

    /**
     * Campo ausente é diferente de campo vazio. Só o que veio no corpo pode ser
     * escrito, senão uma atualização de telefone apaga o nome.
     */
    it('should only write the fields that were actually sent', async () => {
      await service.updateProfile('u-1', { phone: '14999998888' });

      expect(userRepository.update).toHaveBeenCalledWith('u-1', { phone: '14999998888' });
    });

    it('should invalidate the cached profile after writing', async () => {
      await service.updateProfile('u-1', { name: 'Novo' });

      expect(cacheService.delete).toHaveBeenCalledWith('user:u-1');
    });

    it('should refuse to update a user that does not exist', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(null as never);

      await expect(service.updateProfile('u-x', { name: 'Novo' })).rejects.toThrow(NotFoundError);
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      jest.mocked(userRepository.findById).mockResolvedValue(usuario() as never);
      jest.mocked(userRepository.save).mockResolvedValue(usuario() as never);
    });

    /**
     * Trocar senha exige provar a senha atual. Sem isso, uma sessão roubada vira
     * conta roubada em definitivo.
     */
    it('should require the current password to be correct', async () => {
      const alvo = usuario({ comparePassword: jest.fn().mockResolvedValue(false) });
      jest.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(alvo as never);

      await expect(
        service.changePassword('u-1', { currentPassword: 'errada', newPassword: 'NovaSenha1!' })
      ).rejects.toThrow(ValidationError);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should reject reusing the very same password', async () => {
      jest.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(usuario() as never);

      await expect(
        service.changePassword('u-1', { currentPassword: 'Igual1!', newPassword: 'Igual1!' })
      ).rejects.toThrow(/different from current/i);
    });

    it('should persist the new password and drop the cached profile', async () => {
      const alvo = usuario();
      jest.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(alvo as never);

      await service.changePassword('u-1', {
        currentPassword: 'Atual1!',
        newPassword: 'NovaSenha1!',
      });

      expect(alvo).toHaveProperty('password', 'NovaSenha1!');
      expect(userRepository.save).toHaveBeenCalledWith(alvo);
      expect(cacheService.delete).toHaveBeenCalledWith('user:u-1');
    });

    it('should fail when the account disappeared mid-flight', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(null as never);

      await expect(
        service.changePassword('u-1', { currentPassword: 'a', newPassword: 'b' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should fail when the record carries no password to compare against', async () => {
      jest.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(null as never);

      await expect(
        service.changePassword('u-1', { currentPassword: 'a', newPassword: 'b' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getAllUsers', () => {
    it('should let an admin list everyone', async () => {
      jest.mocked(userRepository.paginate).mockResolvedValue({ data: [], total: 0 } as never);

      await expect(
        service.getAllUsers({ page: 1, limit: 20 }, UserRole.ADMIN)
      ).resolves.toBeDefined();
    });

    it('should refuse a plain user, and refuse before querying', async () => {
      await expect(service.getAllUsers({ page: 1, limit: 20 }, UserRole.USER)).rejects.toThrow(
        AuthorizationError
      );
      expect(userRepository.paginate).not.toHaveBeenCalled();
    });

    /**
     * Manager fica de fora de propósito: gerenciar o próprio time não é o mesmo
     * que enxergar a base inteira de usuários.
     */
    it('should refuse a manager as well', async () => {
      await expect(service.getAllUsers({ page: 1, limit: 20 }, UserRole.MANAGER)).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe('getUserById', () => {
    beforeEach(() => {
      jest.mocked(userRepository.findById).mockResolvedValue(usuario() as never);
    });

    it('should let anyone read their own profile', async () => {
      await expect(service.getUserById('u-1', 'u-1', UserRole.USER)).resolves.toBeDefined();
    });

    it('should let an admin read anyone', async () => {
      await expect(service.getUserById('u-9', 'u-1', UserRole.ADMIN)).resolves.toBeDefined();
    });

    it('should block a user from reading a different profile', async () => {
      await expect(service.getUserById('u-9', 'u-1', UserRole.USER)).rejects.toThrow(
        AuthorizationError
      );
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('should report not found for an id nobody owns', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(null as never);

      await expect(service.getUserById('u-1', 'u-1', UserRole.USER)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteAccount', () => {
    /**
     * Exclusão é lógica, e isso é exigência de LGPD e de auditoria ao mesmo
     * tempo: o registro some da aplicação sem sumir do histórico.
     */
    it('should soft delete rather than remove the row', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(usuario() as never);

      await service.deleteAccount('u-1');

      expect(userRepository.softDelete).toHaveBeenCalledWith('u-1');
      expect(cacheService.delete).toHaveBeenCalledWith('user:u-1');
    });

    it('should refuse to delete an account that is not there', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(null as never);

      await expect(service.deleteAccount('u-x')).rejects.toThrow(NotFoundError);
      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
