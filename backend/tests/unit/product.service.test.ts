import { ProductService } from '../../src/services/product.service';
import { productRepository } from '../../src/repositories/product.repository';
import { cacheService } from '../../src/services/cache.service';
import { Product } from '../../src/models/product.entity';
import { UserRole } from '../../src/models/user.entity';
import { NotFoundError, AuthorizationError } from '../../src/errors/AppError';

jest.mock('../../src/repositories/product.repository');
jest.mock('../../src/services/cache.service');
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockRepo = productRepository as jest.Mocked<typeof productRepository>;
const mockCache = cacheService as jest.Mocked<typeof cacheService>;

describe('ProductService', () => {
  let productService: ProductService;

  beforeEach(() => {
    productService = new ProductService();
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue();
    mockCache.delete.mockResolvedValue();
    mockCache.deletePattern.mockResolvedValue();
  });

  describe('createProduct', () => {
    it('should create a product and invalidate cache', async () => {
      const mockProduct = { id: 'prod-1', name: 'Test Product' } as Product;
      mockRepo.create.mockResolvedValue(mockProduct);

      const result = await productService.createProduct(
        { name: 'Test Product', price: 99.99, stock: 10 },
        'user-1'
      );

      expect(result).toEqual(mockProduct);
      expect(mockCache.deletePattern).toHaveBeenCalledWith('products:*');
    });
  });

  describe('getProductById', () => {
    it('should return product from cache if available', async () => {
      const mockProduct = { id: 'prod-1', name: 'Cached Product' } as Product;
      mockCache.get.mockResolvedValue(mockProduct);

      const result = await productService.getProductById('prod-1');

      expect(result).toEqual(mockProduct);
      expect(mockRepo.findByIdWithCreator).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache on miss', async () => {
      const mockProduct = { id: 'prod-1', name: 'DB Product' } as Product;
      mockCache.get.mockResolvedValue(null);
      mockRepo.findByIdWithCreator.mockResolvedValue(mockProduct);

      const result = await productService.getProductById('prod-1');

      expect(result).toEqual(mockProduct);
      expect(mockCache.set).toHaveBeenCalledWith('product:prod-1', mockProduct, 300);
    });

    it('should throw NotFoundError for missing product', async () => {
      mockRepo.findByIdWithCreator.mockResolvedValue(null);

      await expect(productService.getProductById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteProduct', () => {
    it('should prevent regular users from deleting others products', async () => {
      const mockProduct = { id: 'prod-1', createdById: 'other-user' } as Product;
      mockRepo.findById.mockResolvedValue(mockProduct);

      await expect(
        productService.deleteProduct('prod-1', 'user-1', UserRole.USER)
      ).rejects.toThrow(AuthorizationError);
    });

    it('should allow admin to delete any product', async () => {
      const mockProduct = { id: 'prod-1', createdById: 'other-user' } as Product;
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.softDelete.mockResolvedValue();

      await expect(
        productService.deleteProduct('prod-1', 'admin-1', UserRole.ADMIN)
      ).resolves.not.toThrow();
    });
  });
});
