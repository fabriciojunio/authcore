import type { NextFunction, Request, Response } from 'express';
import { authenticate, authorize, optionalAuth } from '../../src/middlewares/auth.middleware';
import { tokenService } from '../../src/services/token.service';
import { cacheService } from '../../src/services/cache.service';
import { userRepository } from '../../src/repositories/user.repository';
import { AuthenticationError, AuthorizationError } from '../../src/errors/AppError';
import { UserRole, UserStatus } from '../../src/models/user.entity';

jest.mock('../../src/services/cache.service');
jest.mock('../../src/repositories/user.repository');

/**
 * O portão da API.
 *
 * Tudo que passa daqui é considerado autenticado pelo resto do sistema, então
 * cada caminho que devolve sem lançar precisa estar cravado. Os testes abaixo
 * cobrem principalmente as formas de entrar sem credencial válida.
 */
describe('authenticate (portão de entrada)', () => {
  const proximo = jest.fn() as NextFunction;
  const resposta = {} as Response;

  function requisicaoCom(authorization?: string): Request {
    return { headers: authorization ? { authorization } : {} } as Request;
  }

  function usuarioAtivo(papel: UserRole = UserRole.USER) {
    return {
      id: 'u-1',
      email: 'usuario@teste.com',
      role: papel,
      status: UserStatus.ACTIVE,
      isActive: () => true,
    };
  }

  beforeEach(() => {
    jest.mocked(cacheService.isTokenBlacklisted).mockResolvedValue(false);
    jest.mocked(cacheService.get).mockResolvedValue(null);
    jest.mocked(cacheService.set).mockResolvedValue(undefined);
    jest.mocked(userRepository.findById).mockResolvedValue(usuarioAtivo() as never);
  });

  function tokenValidoDe(papel: UserRole = UserRole.USER) {
    return tokenService.generateTokenPair({
      sub: 'u-1',
      email: 'usuario@teste.com',
      role: papel,
    }).accessToken;
  }

  describe('cabeçalho ausente ou malformado', () => {
    it('should reject a request with no Authorization header', async () => {
      await expect(authenticate(requisicaoCom(), resposta, proximo)).rejects.toThrow(
        AuthenticationError
      );
    });

    it('should reject a bare token without the Bearer scheme', async () => {
      await expect(
        authenticate(requisicaoCom(tokenValidoDe()), resposta, proximo)
      ).rejects.toThrow(AuthenticationError);
    });

    /**
     * "bearer" minúsculo é recusado hoje. Isso é mais estrito do que a RFC 6750
     * pede, e está aqui documentado para não ser confundido com defeito.
     */
    it('should reject a lowercase bearer scheme (stricter than RFC 6750)', async () => {
      await expect(
        authenticate(requisicaoCom(`bearer ${tokenValidoDe()}`), resposta, proximo)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('token inválido', () => {
    it('should reject a token that is not a JWT at all', async () => {
      await expect(
        authenticate(requisicaoCom('Bearer nao-e-um-token'), resposta, proximo)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should reject a refresh token presented as an access token', async () => {
      const { refreshToken } = tokenService.generateTokenPair({
        sub: 'u-1',
        email: 'usuario@teste.com',
        role: UserRole.USER,
      });

      await expect(
        authenticate(requisicaoCom(`Bearer ${refreshToken}`), resposta, proximo)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('revogação', () => {
    /**
     * A checagem da lista de revogados tem que vir antes da verificação da
     * assinatura, senão um token revogado mas ainda no prazo passa direto.
     */
    it('should reject a revoked token even though its signature is still valid', async () => {
      jest.mocked(cacheService.isTokenBlacklisted).mockResolvedValue(true);

      await expect(
        authenticate(requisicaoCom(`Bearer ${tokenValidoDe()}`), resposta, proximo)
      ).rejects.toThrow('Token has been revoked');
    });

    it('should look the token up by its hash, never by its raw value', async () => {
      const token = tokenValidoDe();

      await authenticate(requisicaoCom(`Bearer ${token}`), resposta, proximo);

      const [consultado] = jest.mocked(cacheService.isTokenBlacklisted).mock.calls[0]!;
      expect(consultado).not.toBe(token);
      expect(consultado).toBe(tokenService.hashToken(token));
    });
  });

  describe('estado da conta', () => {
    it('should reject a token belonging to a deleted user', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue(null as never);

      await expect(
        authenticate(requisicaoCom(`Bearer ${tokenValidoDe()}`), resposta, proximo)
      ).rejects.toThrow('User account is not available');
    });

    /**
     * Suspender uma conta não invalida os tokens já emitidos. Sem esta
     * verificação, quem foi suspenso continua entrando até o token expirar.
     */
    it('should reject a token belonging to a suspended user', async () => {
      jest.mocked(userRepository.findById).mockResolvedValue({
        ...usuarioAtivo(),
        status: UserStatus.SUSPENDED,
        isActive: () => false,
      } as never);

      await expect(
        authenticate(requisicaoCom(`Bearer ${tokenValidoDe()}`), resposta, proximo)
      ).rejects.toThrow('User account is not available');
    });
  });

  describe('caminho feliz e cache', () => {
    it('should attach the user to the request and hand control forward', async () => {
      const requisicao = requisicaoCom(`Bearer ${tokenValidoDe()}`);

      await authenticate(requisicao, resposta, proximo);

      expect(requisicao.user).toEqual({
        id: 'u-1',
        email: 'usuario@teste.com',
        role: UserRole.USER,
      });
      expect(proximo).toHaveBeenCalled();
    });

    it('should cache the lookup for a short window', async () => {
      await authenticate(requisicaoCom(`Bearer ${tokenValidoDe()}`), resposta, proximo);

      expect(cacheService.set).toHaveBeenCalledWith(
        'auth:u-1',
        { id: 'u-1', email: 'usuario@teste.com', role: UserRole.USER },
        60
      );
    });

    it('should skip the database when the cache already answers', async () => {
      jest.mocked(cacheService.get).mockResolvedValue({
        id: 'u-1',
        email: 'usuario@teste.com',
        role: UserRole.USER,
      } as never);

      await authenticate(requisicaoCom(`Bearer ${tokenValidoDe()}`), resposta, proximo);

      expect(userRepository.findById).not.toHaveBeenCalled();
    });
  });
});

describe('authorize (controle de papel)', () => {
  const resposta = {} as Response;

  function requisicaoDe(papel?: UserRole): Request {
    return (papel ? { user: { id: 'u-1', email: 'a@b.com', role: papel } } : {}) as Request;
  }

  it('should let a user through when the role is on the list', () => {
    const proximo = jest.fn();

    authorize(UserRole.ADMIN, UserRole.USER)(requisicaoDe(UserRole.USER), resposta, proximo);

    expect(proximo).toHaveBeenCalled();
  });

  it('should block a user whose role is not on the list', () => {
    expect(() =>
      authorize(UserRole.ADMIN)(requisicaoDe(UserRole.USER), resposta, jest.fn())
    ).toThrow(AuthorizationError);
  });

  /**
   * authorize sem authenticate antes é erro de montagem de rota. Falhar com 401
   * em vez de deixar passar é o que evita que o descuido vire rota aberta.
   */
  it('should refuse when no user was attached, instead of assuming anonymous is fine', () => {
    expect(() => authorize(UserRole.ADMIN)(requisicaoDe(), resposta, jest.fn())).toThrow(
      AuthenticationError
    );
  });

  it('should name the required roles so the caller can act on the message', () => {
    expect(() =>
      authorize(UserRole.ADMIN, UserRole.MANAGER)(requisicaoDe(UserRole.USER), resposta, jest.fn())
    ).toThrow(/admin/i);
  });

  it('should block everyone when the role list is empty', () => {
    expect(() => authorize()(requisicaoDe(UserRole.ADMIN), resposta, jest.fn())).toThrow(
      AuthorizationError
    );
  });
});

describe('optionalAuth (rota pública que reconhece quem entra)', () => {
  const resposta = {} as Response;

  it('should carry on with no user when there is no header', () => {
    const requisicao = { headers: {} } as Request;
    const proximo = jest.fn();

    optionalAuth(requisicao, resposta, proximo);

    expect(requisicao.user).toBeUndefined();
    expect(proximo).toHaveBeenCalled();
  });

  it('should identify the caller when the token is good', () => {
    const { accessToken } = tokenService.generateTokenPair({
      sub: 'u-9',
      email: 'visitante@teste.com',
      role: UserRole.USER,
    });
    const requisicao = { headers: { authorization: `Bearer ${accessToken}` } } as Request;

    optionalAuth(requisicao, resposta, jest.fn());

    expect(requisicao.user?.id).toBe('u-9');
  });

  /**
   * Token ruim numa rota pública não pode virar 401: a rota é pública. O
   * visitante segue anônimo.
   */
  it('should stay anonymous rather than fail on a bad token', () => {
    const requisicao = { headers: { authorization: 'Bearer lixo' } } as Request;
    const proximo = jest.fn();

    optionalAuth(requisicao, resposta, proximo);

    expect(requisicao.user).toBeUndefined();
    expect(proximo).toHaveBeenCalled();
  });
});
