import type { Request, Response } from 'express';
import { AuthController } from '../../src/controllers/auth.controller';
import { UserController } from '../../src/controllers/user.controller';
import { authService } from '../../src/services/auth.service';
import { userService } from '../../src/services/user.service';
import { HttpStatus, ValidationError } from '../../src/errors/AppError';
import { UserRole } from '../../src/models/user.entity';

jest.mock('../../src/services/auth.service');
jest.mock('../../src/services/user.service');

/**
 * Os controladores.
 *
 * Eles quase não têm lógica, de propósito, e é justamente por isso que o pouco
 * que fazem precisa estar coberto: montar o cookie de refresh e sanear a
 * paginação. Errar o cookie transforma um token de sete dias em algo que
 * JavaScript da página consegue ler.
 */

type Espia = {
  res: Response;
  status: jest.Mock;
  json: jest.Mock;
  cookie: jest.Mock;
  clearCookie: jest.Mock;
};

function respostaEspia(): Espia {
  const status = jest.fn();
  const espia = {
    status,
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
  status.mockReturnValue(espia);
  return { ...espia, res: espia as unknown as Response };
}

/** Requisição mínima: os controladores só leem alguns campos. */
function req(campos: Record<string, unknown>): Request {
  return campos as unknown as Request;
}

const usuarioLogado = { id: 'u-1', email: 'usuario@teste.com', role: UserRole.USER };

describe('AuthController', () => {
  const controller = new AuthController();

  const tokens = {
    accessToken: 'acesso',
    refreshToken: 'renovacao',
    expiresIn: 900,
  };

  describe('register', () => {
    it('should answer 201 with whatever the service produced', async () => {
      jest.mocked(authService.register).mockResolvedValue({ user: { id: 'u-1' } } as never);
      const resposta = respostaEspia();

      await controller.register(req({ body: { email: 'a@b.com' } }), resposta.res);

      expect(resposta.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(resposta.json).toHaveBeenCalledWith({
        success: true,
        data: { user: { id: 'u-1' } },
      });
    });
  });

  describe('login', () => {
    beforeEach(() => {
      jest.mocked(authService.login).mockResolvedValue({ user: { id: 'u-1' }, tokens } as never);
    });

    /**
     * O refresh vai em cookie httpOnly, sameSite strict e caminho restrito à
     * própria rota de refresh. Qualquer um dos três caindo abre uma porta
     * diferente: XSS lê o token, CSRF usa o token, e um caminho amplo manda o
     * token junto de toda requisição da API.
     */
    it('should put the refresh token in a locked-down cookie', async () => {
      const resposta = respostaEspia();

      await controller.login(req({ body: {}, ip: '203.0.113.7', socket: {} }), resposta.res);

      const [nome, valor, opcoes] = resposta.cookie.mock.calls[0]!;
      expect(nome).toBe('refreshToken');
      expect(valor).toBe('renovacao');
      expect(opcoes).toMatchObject({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
      });
    });

    it('should never put the refresh token in the response body', async () => {
      const resposta = respostaEspia();

      await controller.login(req({ body: {}, ip: '203.0.113.7', socket: {} }), resposta.res);

      const [corpo] = resposta.json.mock.calls[0]!;
      expect(JSON.stringify(corpo)).not.toContain('renovacao');
      expect(corpo.data.accessToken).toBe('acesso');
    });

    it('should record the caller address for the failed-attempt counter', async () => {
      await controller.login(
        req({ body: {}, ip: '203.0.113.7', socket: {} }),
        respostaEspia().res
      );

      expect(authService.login).toHaveBeenCalledWith({}, '203.0.113.7');
    });

    it('should fall back to the socket address when the proxy gave none', async () => {
      await controller.login(
        req({ body: {}, socket: { remoteAddress: '198.51.100.4' } }),
        respostaEspia().res
      );

      expect(authService.login).toHaveBeenCalledWith({}, '198.51.100.4');
    });

    /**
     * Sem endereço nenhum o login não pode ser bloqueado: o contador precisa de
     * uma chave. "unknown" agrupa todos esses casos numa chave só, que é a
     * escolha conservadora.
     */
    it('should use a placeholder rather than an empty key when there is no address', async () => {
      await controller.login(req({ body: {}, socket: {} }), respostaEspia().res);

      expect(authService.login).toHaveBeenCalledWith({}, 'unknown');
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      jest.mocked(authService.refresh).mockResolvedValue(tokens as never);
    });

    /**
     * O cookie ganha do corpo. Aceitar o corpo primeiro deixaria um atacante que
     * controla o corpo escolher qual token será rotacionado.
     */
    it('should prefer the cookie over the request body', async () => {
      await controller.refresh(
        req({ cookies: { refreshToken: 'do-cookie' }, body: { refreshToken: 'do-corpo' } }),
        respostaEspia().res
      );

      expect(authService.refresh).toHaveBeenCalledWith('do-cookie');
    });

    it('should accept the body when there is no cookie (native clients)', async () => {
      await controller.refresh(
        req({ cookies: {}, body: { refreshToken: 'do-corpo' } }),
        respostaEspia().res
      );

      expect(authService.refresh).toHaveBeenCalledWith('do-corpo');
    });

    it('should hand an empty string to the service when neither is present', async () => {
      await controller.refresh(req({ cookies: {}, body: {} }), respostaEspia().res);

      expect(authService.refresh).toHaveBeenCalledWith('');
    });

    it('should rotate the cookie with the newly issued token', async () => {
      const resposta = respostaEspia();

      await controller.refresh(req({ cookies: {}, body: {} }), resposta.res);

      const [, valor, opcoes] = resposta.cookie.mock.calls[0]!;
      expect(valor).toBe('renovacao');
      expect(opcoes).toMatchObject({ httpOnly: true, sameSite: 'strict' });
    });
  });

  describe('logout', () => {
    it('should revoke the session and clear the cookie on the same path it was set', async () => {
      jest.mocked(authService.logout).mockResolvedValue(undefined as never);
      const resposta = respostaEspia();

      await controller.logout(
        req({ cookies: { refreshToken: 'r' }, body: {}, user: usuarioLogado }),
        resposta.res
      );

      expect(authService.logout).toHaveBeenCalledWith('u-1', 'r');
      expect(resposta.clearCookie).toHaveBeenCalledWith('refreshToken', {
        path: '/api/v1/auth/refresh',
      });
    });
  });

  describe('me', () => {
    it('should echo back only what the middleware attached', () => {
      const resposta = respostaEspia();

      controller.me(req({ user: usuarioLogado }), resposta.res);

      expect(resposta.json).toHaveBeenCalledWith({
        success: true,
        data: { user: usuarioLogado },
      });
    });
  });
});

describe('UserController', () => {
  const controller = new UserController();
  const entidade = { toSafeObject: () => ({ id: 'u-1', email: 'usuario@teste.com' }) };

  function requisicaoDe(consulta: Record<string, string> = {}, papel = UserRole.ADMIN): Request {
    return {
      query: consulta,
      params: {},
      body: {},
      user: { ...usuarioLogado, role: papel },
    } as unknown as Request;
  }

  describe('perfil', () => {
    it('should never expose the raw entity, only the safe projection', async () => {
      jest.mocked(userService.getProfile).mockResolvedValue(entidade as never);
      const resposta = respostaEspia();

      await controller.getProfile(requisicaoDe(), resposta.res);

      expect(resposta.json).toHaveBeenCalledWith({
        success: true,
        data: { user: { id: 'u-1', email: 'usuario@teste.com' } },
      });
    });

    it('should update the profile of the caller, never of an id from the body', async () => {
      jest.mocked(userService.updateProfile).mockResolvedValue(entidade as never);

      await controller.updateProfile(requisicaoDe(), respostaEspia().res);

      expect(userService.updateProfile).toHaveBeenCalledWith('u-1', {});
    });

    it('should confirm a password change without echoing anything back', async () => {
      jest.mocked(userService.changePassword).mockResolvedValue(undefined as never);
      const resposta = respostaEspia();

      await controller.changePassword(requisicaoDe(), resposta.res);

      const [corpo] = resposta.json.mock.calls[0]!;
      expect(corpo.data).toEqual({ message: 'Password changed successfully' });
    });

    it('should delete the account of the caller', async () => {
      jest.mocked(userService.deleteAccount).mockResolvedValue(undefined as never);

      await controller.deleteAccount(requisicaoDe(), respostaEspia().res);

      expect(userService.deleteAccount).toHaveBeenCalledWith('u-1');
    });

    it('should read the target id from the path and the identity from the token', async () => {
      jest.mocked(userService.getUserById).mockResolvedValue(entidade as never);
      const requisicao = requisicaoDe();
      (requisicao.params as Record<string, string>)['id'] = 'u-9';

      await controller.getUserById(requisicao, respostaEspia().res);

      expect(userService.getUserById).toHaveBeenCalledWith('u-9', 'u-1', UserRole.ADMIN);
    });
  });

  describe('getAllUsers: saneamento da paginação', () => {
    beforeEach(() => {
      jest.mocked(userService.getAllUsers).mockResolvedValue({
        data: [entidade],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false },
      } as never);
    });

    it('should default to the first page with twenty rows', async () => {
      await controller.getAllUsers(requisicaoDe(), respostaEspia().res);

      expect(userService.getAllUsers).toHaveBeenCalledWith(
        { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'DESC' },
        UserRole.ADMIN
      );
    });

    /**
     * O teto de cem existe para que ninguém peça a base inteira numa
     * requisição. Sem ele, limit=1000000 vira um plano de leitura sequencial.
     */
    it('should cap the page size at one hundred', async () => {
      await controller.getAllUsers(requisicaoDe({ limit: '1000000' }), respostaEspia().res);

      expect(userService.getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
        UserRole.ADMIN
      );
    });

    it('should treat unparseable numbers as the default rather than NaN', async () => {
      await controller.getAllUsers(requisicaoDe({ page: 'abc', limit: 'xyz' }), respostaEspia().res);

      expect(userService.getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
        UserRole.ADMIN
      );
    });

    it('should reject a negative page instead of computing a negative offset', async () => {
      await expect(
        controller.getAllUsers(requisicaoDe({ page: '-5' }), respostaEspia().res)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject a negative page size', async () => {
      await expect(
        controller.getAllUsers(requisicaoDe({ limit: '-1' }), respostaEspia().res)
      ).rejects.toThrow(ValidationError);
    });

    it('should normalise the sort direction to upper case', async () => {
      await controller.getAllUsers(requisicaoDe({ sortOrder: 'asc' }), respostaEspia().res);

      expect(userService.getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 'ASC' }),
        UserRole.ADMIN
      );
    });

    it('should project every row through toSafeObject and keep the page metadata', async () => {
      const resposta = respostaEspia();

      await controller.getAllUsers(requisicaoDe(), resposta.res);

      const [corpo] = resposta.json.mock.calls[0]!;
      expect(corpo.data).toEqual([{ id: 'u-1', email: 'usuario@teste.com' }]);
      expect(corpo.meta.total).toBe(1);
    });
  });
});
