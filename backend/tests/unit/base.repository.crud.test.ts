// Caminhos de leitura, escrita e falha do repositório base.
//
// A injeção de SQL na paginação tem arquivo próprio (base.repository.test.ts).
// Aqui o assunto é outro: toda falha do TypeORM tem que sair daqui como
// DatabaseError. Se uma exceção crua vazar, o middleware de erro cai no ramo
// genérico e o cliente recebe 500 sem código, o que é pior de diagnosticar do
// que a falha original.

const findOne = jest.fn();
const find = jest.fn();
const create = jest.fn();
const save = jest.fn();
const update = jest.fn();
const softDelete = jest.fn();
const del = jest.fn();
const count = jest.fn();
const getManyAndCount = jest.fn();

const construtorDeConsulta = {
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getManyAndCount,
};

const repositorioFalso = {
  metadata: { columns: [{ propertyName: 'id' }, { propertyName: 'createdAt' }] },
  createQueryBuilder: jest.fn(() => construtorDeConsulta),
  findOne,
  find,
  create,
  save,
  update,
  softDelete,
  delete: del,
  count,
};

jest.mock('../../src/config/database', () => ({
  AppDataSource: { getRepository: jest.fn(() => repositorioFalso) },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { BaseRepository } from '../../src/repositories/base.repository';
import { DatabaseError } from '../../src/errors/AppError';

class Coisa {
  id!: string;
}
class RepositorioDeCoisa extends BaseRepository<Coisa> {
  constructor() {
    super(Coisa);
  }
}

const quedaDoBanco = new Error('connect ECONNREFUSED 127.0.0.1:5432');

describe('BaseRepository', () => {
  let repo: RepositorioDeCoisa;

  beforeEach(() => {
    jest.clearAllMocks();
    getManyAndCount.mockResolvedValue([[], 0]);
    repo = new RepositorioDeCoisa();
  });

  describe('findById', () => {
    it('should look the row up by primary key', async () => {
      findOne.mockResolvedValue({ id: 'c-1' });

      await expect(repo.findById('c-1')).resolves.toEqual({ id: 'c-1' });
      expect(findOne).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('should return null for an id that is not there', async () => {
      findOne.mockResolvedValue(null);

      await expect(repo.findById('c-x')).resolves.toBeNull();
    });

    it('should convert a driver failure into DatabaseError', async () => {
      findOne.mockRejectedValue(quedaDoBanco);

      await expect(repo.findById('c-1')).rejects.toThrow(DatabaseError);
    });

    /**
     * A mensagem original cita host e porta do banco. Ela fica no log e não
     * pode viajar dentro do erro que sobe.
     */
    it('should not carry the driver message upwards', async () => {
      findOne.mockRejectedValue(quedaDoBanco);

      await expect(repo.findById('c-1')).rejects.not.toThrow('127.0.0.1:5432');
    });
  });

  describe('findOne e findMany', () => {
    it('should pass the filter through untouched', async () => {
      findOne.mockResolvedValue(null);

      await repo.findOne({ id: 'c-1' } as never);

      expect(findOne).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('should list everything when no filter is given', async () => {
      find.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);

      await expect(repo.findMany()).resolves.toHaveLength(2);
      expect(find).toHaveBeenCalledWith({ where: undefined });
    });

    it('should convert failures of both into DatabaseError', async () => {
      findOne.mockRejectedValue(quedaDoBanco);
      find.mockRejectedValue(quedaDoBanco);

      await expect(repo.findOne({} as never)).rejects.toThrow(DatabaseError);
      await expect(repo.findMany()).rejects.toThrow(DatabaseError);
    });
  });

  describe('paginate: metadados da página', () => {
    it('should compute the page count from the total and the limit', async () => {
      getManyAndCount.mockResolvedValue([[{ id: 'c-1' }], 25]);

      const pagina = await repo.paginate({ page: 1, limit: 10 });

      expect(pagina.meta).toEqual({
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('should mark the last page as having no next', async () => {
      getManyAndCount.mockResolvedValue([[], 25]);

      const pagina = await repo.paginate({ page: 3, limit: 10 });

      expect(pagina.meta.hasNext).toBe(false);
      expect(pagina.meta.hasPrev).toBe(true);
    });

    /**
     * Zero registros tem que dar zero páginas, e não uma página vazia com
     * hasNext ligado. É o caso que costuma travar o botão "próxima" do cliente.
     */
    it('should report zero pages for an empty table', async () => {
      getManyAndCount.mockResolvedValue([[], 0]);

      const pagina = await repo.paginate({ page: 1, limit: 10 });

      expect(pagina.meta.totalPages).toBe(0);
      expect(pagina.meta.hasNext).toBe(false);
      expect(pagina.meta.hasPrev).toBe(false);
    });

    it('should skip the right number of rows for the requested page', async () => {
      await repo.paginate({ page: 4, limit: 25 });

      expect(construtorDeConsulta.skip).toHaveBeenCalledWith(75);
      expect(construtorDeConsulta.take).toHaveBeenCalledWith(25);
    });

    it('should let the caller refine the query further', async () => {
      const refinar = jest.fn((qb) => qb);

      await repo.paginate({ page: 1, limit: 10 }, refinar as never);

      expect(refinar).toHaveBeenCalled();
    });

    it('should convert a failure into DatabaseError', async () => {
      getManyAndCount.mockRejectedValue(quedaDoBanco);

      await expect(repo.paginate({ page: 1, limit: 10 })).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('should build the entity before saving it', async () => {
      create.mockReturnValue({ id: 'c-1' });
      save.mockResolvedValue({ id: 'c-1' });

      await expect(repo.create({ id: 'c-1' } as never)).resolves.toEqual({ id: 'c-1' });
      expect(create).toHaveBeenCalledWith({ id: 'c-1' });
    });

    it('should convert a constraint violation into DatabaseError', async () => {
      create.mockReturnValue({});
      save.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

      await expect(repo.create({} as never)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should return the row as it stands after the write', async () => {
      update.mockResolvedValue({ affected: 1 });
      findOne.mockResolvedValue({ id: 'c-1', nome: 'novo' });

      await expect(repo.update('c-1', { nome: 'novo' } as never)).resolves.toEqual({
        id: 'c-1',
        nome: 'novo',
      });
    });

    /**
     * Update que não encontra a linha não é sucesso silencioso: alguém apagou o
     * registro entre a leitura e a escrita, e quem chamou precisa saber.
     */
    it('should fail loudly when the row vanished between write and read', async () => {
      update.mockResolvedValue({ affected: 0 });
      findOne.mockResolvedValue(null);

      await expect(repo.update('c-1', {} as never)).rejects.toThrow('Entity not found after update');
    });

    it('should not wrap a DatabaseError inside another one', async () => {
      update.mockResolvedValue({ affected: 0 });
      findOne.mockResolvedValue(null);

      await expect(repo.update('c-1', {} as never)).rejects.toThrow(DatabaseError);
    });

    it('should convert a driver failure into DatabaseError', async () => {
      update.mockRejectedValue(quedaDoBanco);

      await expect(repo.update('c-1', {} as never)).rejects.toThrow(DatabaseError);
    });
  });

  describe('remoção', () => {
    it('should soft delete by id', async () => {
      softDelete.mockResolvedValue({ affected: 1 });

      await repo.softDelete('c-1');

      expect(softDelete).toHaveBeenCalledWith('c-1');
      expect(del).not.toHaveBeenCalled();
    });

    it('should hard delete only when explicitly asked', async () => {
      del.mockResolvedValue({ affected: 1 });

      await repo.hardDelete('c-1');

      expect(del).toHaveBeenCalledWith('c-1');
    });

    it('should convert failures of both into DatabaseError', async () => {
      softDelete.mockRejectedValue(quedaDoBanco);
      del.mockRejectedValue(quedaDoBanco);

      await expect(repo.softDelete('c-1')).rejects.toThrow(DatabaseError);
      await expect(repo.hardDelete('c-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('count e exists', () => {
    it('should count with the given filter', async () => {
      count.mockResolvedValue(7);

      await expect(repo.count({ id: 'c-1' } as never)).resolves.toBe(7);
    });

    it('should answer exists from the count', async () => {
      count.mockResolvedValue(1);
      await expect(repo.exists({ id: 'c-1' } as never)).resolves.toBe(true);

      count.mockResolvedValue(0);
      await expect(repo.exists({ id: 'c-1' } as never)).resolves.toBe(false);
    });

    it('should let the DatabaseError from count surface through exists', async () => {
      count.mockRejectedValue(quedaDoBanco);

      await expect(repo.exists({} as never)).rejects.toThrow(DatabaseError);
    });
  });
});
