import { productRepository } from '@repositories/product.repository';
import { cacheService } from './cache.service';
import { Product, ProductStatus } from '@models/product.entity';
import { NotFoundError, AuthorizationError } from '@errors/AppError';
import { logger } from '@config/logger';
import { UserRole } from '@models/user.entity';
import { PaginatedResult, PaginationOptions } from '@repositories/base.repository';

export interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  status?: ProductStatus;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  sku?: string;
  category?: string;
  status?: ProductStatus;
}

export interface ProductFilters {
  status?: ProductStatus;
  category?: string;
  search?: string;
}

export class ProductService {
  async createProduct(dto: CreateProductDto, userId: string): Promise<Product> {
    const product = await productRepository.create({
      ...dto,
      createdById: userId,
    });

    await cacheService.deletePattern('products:*');
    logger.info('Product created', { productId: product.id, userId });
    return product;
  }

  async getProducts(
    options: PaginationOptions,
    filters: ProductFilters
  ): Promise<PaginatedResult<Product>> {
    const cacheKey = `products:${options.page}:${options.limit}:${options.sortBy}:${options.sortOrder}:${filters.status ?? ''}:${filters.category ?? ''}:${filters.search ?? ''}`;
    const cached = await cacheService.get<PaginatedResult<Product>>(cacheKey);
    if (cached) return cached;

    const result = await productRepository.paginateWithFilters(options, filters);

    await cacheService.set(cacheKey, result, 60); // 1 min cache
    return result;
  }

  async getProductById(id: string): Promise<Product> {
    const cacheKey = `product:${id}`;
    const cached = await cacheService.get<Product>(cacheKey);
    if (cached) return cached;

    const product = await productRepository.findByIdWithCreator(id);
    if (!product) throw new NotFoundError('Product');

    await cacheService.set(cacheKey, product, 300);
    return product;
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    userId: string,
    userRole: UserRole
  ): Promise<Product> {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError('Product');

    // Only admin/manager or the creator can update
    if (userRole === UserRole.USER && product.createdById !== userId) {
      throw new AuthorizationError('You can only update your own products');
    }

    const updated = await productRepository.update(id, dto);

    await cacheService.delete(`product:${id}`);
    await cacheService.deletePattern('products:*');
    logger.info('Product updated', { productId: id, userId });
    return updated;
  }

  async deleteProduct(id: string, userId: string, userRole: UserRole): Promise<void> {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError('Product');

    if (userRole === UserRole.USER && product.createdById !== userId) {
      throw new AuthorizationError('You can only delete your own products');
    }

    await productRepository.softDelete(id);
    await cacheService.delete(`product:${id}`);
    await cacheService.deletePattern('products:*');
    logger.info('Product deleted', { productId: id, userId });
  }

  async updateProductImage(id: string, imageUrl: string, userId: string, userRole: UserRole): Promise<Product> {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError('Product');

    if (userRole === UserRole.USER && product.createdById !== userId) {
      throw new AuthorizationError('Unauthorized');
    }

    const updated = await productRepository.update(id, { imageUrl });
    await cacheService.delete(`product:${id}`);
    return updated;
  }
}

export const productService = new ProductService();
