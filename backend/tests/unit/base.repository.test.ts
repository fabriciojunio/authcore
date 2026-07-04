// Garante que a paginacao nao permite injecao de SQL via sortBy/sortOrder.

const orderBy = jest.fn().mockReturnThis();
const skip = jest.fn().mockReturnThis();
const take = jest.fn().mockReturnThis();
const getManyAndCount = jest.fn().mockResolvedValue([[], 0]);

const fakeRepository = {
  metadata: {
    columns: [{ propertyName: 'id' }, { propertyName: 'email' }, { propertyName: 'createdAt' }],
  },
  createQueryBuilder: jest.fn().mockReturnValue({ orderBy, skip, take, getManyAndCount }),
};

jest.mock('../../src/config/database', () => ({
  AppDataSource: { getRepository: jest.fn(() => fakeRepository) },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { BaseRepository } from '../../src/repositories/base.repository';

class Dummy {
  id!: string;
}
class DummyRepository extends BaseRepository<Dummy> {
  constructor() {
    super(Dummy);
  }
}

describe('BaseRepository.paginate (proteção contra SQL injection)', () => {
  let repo: DummyRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new DummyRepository();
  });

  it('should use a valid column when sortBy is legitimate', async () => {
    await repo.paginate({ page: 1, limit: 10, sortBy: 'email', sortOrder: 'ASC' });
    expect(orderBy).toHaveBeenCalledWith('entity.email', 'ASC');
  });

  it('should ignore a malicious sortBy and fall back to a safe column', async () => {
    await repo.paginate({
      page: 1,
      limit: 10,
      sortBy: 'id; DROP TABLE users; --',
      sortOrder: 'DESC',
    });
    expect(orderBy).toHaveBeenCalledWith('entity.createdAt', 'DESC');
  });

  it('should normalize an invalid sortOrder to DESC', async () => {
    await repo.paginate({
      page: 1,
      limit: 10,
      sortBy: 'email',
      sortOrder: 'ASC); DELETE FROM users; --' as unknown as 'ASC',
    });
    expect(orderBy).toHaveBeenCalledWith('entity.email', 'DESC');
  });
});
