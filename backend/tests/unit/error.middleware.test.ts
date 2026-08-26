import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { QueryFailedError } from 'typeorm';
import { errorHandler, notFoundHandler } from '../../src/middlewares/error.middleware';
import { AppError, HttpStatus, NotFoundError } from '../../src/errors/AppError';
import { config } from '../../src/config/app.config';

/**
 * A última parada antes do cliente.
 *
 * Este arquivo decide o que o mundo externo vê quando algo quebra. O risco não
 * é a resposta ficar feia: é ela contar demais. Detalhe de banco, caminho de
 * arquivo e rastro de pilha são mapa para quem estiver sondando.
 */
describe('errorHandler', () => {
  const requisicao = {
    method: 'POST',
    url: '/api/v1/pedidos',
    ip: '203.0.113.7',
  } as Request;

  function respostaEspia() {
    const resposta = {
      status: jest.fn(),
      json: jest.fn(),
    };
    resposta.status.mockReturnValue(resposta);
    return resposta as unknown as Response & { status: jest.Mock; json: jest.Mock };
  }

  function corpoDe(erro: Error) {
    const resposta = respostaEspia();
    errorHandler(erro, requisicao, resposta, jest.fn() as NextFunction);
    return {
      status: resposta.status.mock.calls[0]![0] as number,
      corpo: resposta.json.mock.calls[0]![0] as {
        success: false;
        error: Record<string, unknown>;
      },
    };
  }

  describe('erros próprios da aplicação', () => {
    it('should preserve the status and code of an AppError', () => {
      const { status, corpo } = corpoDe(new NotFoundError('User'));

      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(corpo.error.code).toBe('NOT_FOUND');
      expect(corpo.success).toBe(false);
    });

    it('should carry the details when the error brought any', () => {
      const { corpo } = corpoDe(
        new AppError('Falhou', HttpStatus.BAD_REQUEST, 'RUIM', true, { campo: 'email' })
      );

      expect(corpo.error.details).toEqual({ campo: 'email' });
    });

    it('should omit the details key entirely when there are none', () => {
      const { corpo } = corpoDe(new NotFoundError('User'));

      expect(corpo.error).not.toHaveProperty('details');
    });
  });

  describe('erros de validação', () => {
    it('should flatten a Zod error into field and message pairs', () => {
      const esquema = z.object({ email: z.string().email(), idade: z.number().min(18) });
      const falha = esquema.safeParse({ email: 'nao-e-email', idade: 10 });

      const { status, corpo } = corpoDe(falha.error!);

      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(corpo.error.code).toBe('VALIDATION_ERROR');
      expect(corpo.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'idade' }),
        ])
      );
    });

    it('should join nested paths with a dot so the client can locate the field', () => {
      const esquema = z.object({ endereco: z.object({ cep: z.string().min(8) }) });
      const falha = esquema.safeParse({ endereco: { cep: '1' } });

      const { corpo } = corpoDe(falha.error!);

      expect(corpo.error.details).toEqual([
        expect.objectContaining({ field: 'endereco.cep' }),
      ]);
    });
  });

  describe('erros de banco', () => {
    function falhaDeConsulta(detalhe: string) {
      const erro = new QueryFailedError('INSERT ...', [], new Error('falhou'));
      (erro as unknown as { detail: string }).detail = detalhe;
      return erro;
    }

    it('should turn a unique constraint violation into 409', () => {
      const { status, corpo } = corpoDe(
        falhaDeConsulta('Key (email)=(a@b.com) already exists, unique constraint')
      );

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(corpo.error.code).toBe('CONFLICT');
    });

    it('should turn a foreign key violation into 400', () => {
      const { status, corpo } = corpoDe(
        falhaDeConsulta('violates foreign key constraint "pedidos_user_id_fkey"')
      );

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(corpo.error.code).toBe('INVALID_REFERENCE');
    });

    /**
     * O detalhe do Postgres cita nome de tabela, de coluna e o valor que
     * colidiu. Nada disso pode sair na resposta.
     */
    it('should never leak the database detail to the client', () => {
      const { corpo } = corpoDe(
        falhaDeConsulta('Key (email)=(vitima@empresa.com) already exists, unique constraint')
      );

      expect(JSON.stringify(corpo)).not.toContain('vitima@empresa.com');
      expect(JSON.stringify(corpo)).not.toContain('unique constraint');
    });

    it('should fall back to a generic 500 for an unrecognised database failure', () => {
      const { status, corpo } = corpoDe(falhaDeConsulta('deadlock detected'));

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(corpo.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('erros de upload', () => {
    it('should translate a Multer error into a 400 the client can act on', () => {
      const erro = new Error('File too large');
      erro.name = 'MulterError';

      const { status, corpo } = corpoDe(erro);

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(corpo.error.code).toBe('FILE_UPLOAD_ERROR');
      expect(corpo.error.message).toBe('File too large');
    });
  });

  describe('erros inesperados', () => {
    it('should replace an unknown error message with a generic one', () => {
      const { status, corpo } = corpoDe(
        new Error('connect ECONNREFUSED 10.0.0.5:5432 as user postgres')
      );

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(corpo.error.message).toBe('An unexpected error occurred');
      expect(JSON.stringify(corpo)).not.toContain('10.0.0.5');
    });

    /**
     * O rastro de pilha entrega estrutura de diretório e versões de biblioteca.
     * Em teste NODE_ENV é "test", que não é "development", então nunca deve
     * aparecer.
     */
    it('should never include a stack trace outside development', () => {
      const { corpo } = corpoDe(new Error('quebrou'));

      expect(corpo.error).not.toHaveProperty('stack');
      expect(config.node.env).not.toBe('development');
    });
  });

  describe('rastreabilidade', () => {
    it('should stamp every response with a request id and a timestamp', () => {
      const { corpo } = corpoDe(new NotFoundError('User'));

      expect(corpo.error.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(() => new Date(corpo.error.timestamp as string).toISOString()).not.toThrow();
    });

    /**
     * Dois erros não podem compartilhar identificador, senão o cliente que abre
     * chamado citando o id manda o suporte para o log errado.
     */
    it('should give a different id to each response', () => {
      const primeiro = corpoDe(new NotFoundError('User')).corpo.error.requestId;
      const segundo = corpoDe(new NotFoundError('User')).corpo.error.requestId;

      expect(primeiro).not.toBe(segundo);
    });
  });
});

describe('notFoundHandler', () => {
  it('should hand a 404 AppError to the error pipeline instead of answering itself', () => {
    const proximo = jest.fn();

    notFoundHandler(
      { method: 'GET', url: '/api/v1/inexistente' } as Request,
      {} as Response,
      proximo as NextFunction
    );

    const [erro] = proximo.mock.calls[0]!;
    expect(erro).toBeInstanceOf(AppError);
    expect((erro as AppError).statusCode).toBe(HttpStatus.NOT_FOUND);
    expect((erro as AppError).code).toBe('ROUTE_NOT_FOUND');
    expect((erro as AppError).message).toContain('/api/v1/inexistente');
  });
});
