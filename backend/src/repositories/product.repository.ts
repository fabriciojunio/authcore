import { Product, ProductStatus } from '@models/product.entity';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super(Product);
  }

  async findByIdWithCreator(id: string): Promise<Product | null> {
    return this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.createdBy', 'user')
      .where('product.id = :id', { id })
      .andWhere('product.deletedAt IS NULL')
      .getOne();
  }

  async paginateWithFilters(
    options: PaginationOptions,
    filters: {
      status?: ProductStatus;
      category?: string;
      search?: string;
      createdById?: string;
    } = {}
  ): Promise<PaginatedResult<Product>> {
    return this.paginate(options, (qb) => {
      qb.leftJoinAndSelect('entity.createdBy', 'user');

      if (filters.status) {
        qb.andWhere('entity.status = :status', { status: filters.status });
      }
      if (filters.category) {
        qb.andWhere('entity.category = :category', { category: filters.category });
      }
      if (filters.search) {
        qb.andWhere(
          '(LOWER(entity.name) LIKE :search OR LOWER(entity.description) LIKE :search)',
          { search: `%${filters.search.toLowerCase()}%` }
        );
      }
      if (filters.createdById) {
        qb.andWhere('entity.createdById = :createdById', { createdById: filters.createdById });
      }

      return qb;
    });
  }
}

export const productRepository = new ProductRepository();
