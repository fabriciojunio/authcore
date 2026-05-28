import { Repository, FindOptionsWhere, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '@config/database';
import { DatabaseError } from '@errors/AppError';
import { logger } from '@config/logger';

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export abstract class BaseRepository<T extends { id: string }> {
  protected repository: Repository<T>;

  constructor(entity: new () => T) {
    this.repository = AppDataSource.getRepository(entity);
  }

  async findById(id: string): Promise<T | null> {
    try {
      return await this.repository.findOne({ where: { id } as FindOptionsWhere<T> });
    } catch (error) {
      logger.error('Repository findById error', { id, error });
      throw new DatabaseError();
    }
  }

  async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
    try {
      return await this.repository.findOne({ where });
    } catch (error) {
      logger.error('Repository findOne error', { where, error });
      throw new DatabaseError();
    }
  }

  async findMany(where?: FindOptionsWhere<T>): Promise<T[]> {
    try {
      return await this.repository.find({ where });
    } catch (error) {
      logger.error('Repository findMany error', { error });
      throw new DatabaseError();
    }
  }

  async paginate(
    options: PaginationOptions,
    queryBuilder?: (qb: SelectQueryBuilder<T>) => SelectQueryBuilder<T>
  ): Promise<PaginatedResult<T>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'DESC' } = options;
    const skip = (page - 1) * limit;

    try {
      let qb = this.repository
        .createQueryBuilder('entity')
        .orderBy(`entity.${sortBy}`, sortOrder)
        .skip(skip)
        .take(limit);

      if (queryBuilder) {
        qb = queryBuilder(qb);
      }

      const [data, total] = await qb.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('Repository paginate error', { options, error });
      throw new DatabaseError();
    }
  }

  async create(data: DeepPartial<T>): Promise<T> {
    try {
      const entity = this.repository.create(data);
      return await this.repository.save(entity);
    } catch (error) {
      logger.error('Repository create error', { error });
      throw new DatabaseError();
    }
  }

  async update(id: string, data: DeepPartial<T>): Promise<T> {
    try {
      await this.repository.update(id, data as never);
      const updated = await this.findById(id);
      if (!updated) throw new DatabaseError('Entity not found after update');
      return updated;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Repository update error', { id, error });
      throw new DatabaseError();
    }
  }

  async save(entity: T): Promise<T> {
    try {
      return await this.repository.save(entity);
    } catch (error) {
      logger.error('Repository save error', { error });
      throw new DatabaseError();
    }
  }

  async softDelete(id: string): Promise<void> {
    try {
      await this.repository.softDelete(id);
    } catch (error) {
      logger.error('Repository softDelete error', { id, error });
      throw new DatabaseError();
    }
  }

  async hardDelete(id: string): Promise<void> {
    try {
      await this.repository.delete(id);
    } catch (error) {
      logger.error('Repository hardDelete error', { id, error });
      throw new DatabaseError();
    }
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    try {
      return await this.repository.count({ where });
    } catch (error) {
      logger.error('Repository count error', { error });
      throw new DatabaseError();
    }
  }

  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }
}
