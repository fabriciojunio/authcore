import type { Request, Response } from 'express';
import { ProductService } from '../../src/services/product.service';
import { ProductController } from '../../src/controllers/product.controller';
import { productRepository } from '../../src/repositories/product.repository';
import { cacheService } from '../../src/services/cache.service';
import { ProductStatus } from '../../src/models/product.entity';
import { UserRole } from '../../src/models/user.entity';
import { AuthorizationError, HttpStatus, NotFoundError } from '../../src/errors/AppError';

jest.mock('../../src/repositories/product.repository');
jest.mock('../../src/services/cache.service');

/**
 * Catálogo de produtos.
 *
 * Duas coisas concentram o risco: quem pode mexer no produto de quem, e a
 * invalidação do cache. A segunda falha em silêncio: o produto é alterado, a
 * listagem continua servindo a versão antiga por um minuto, e ninguém liga uma
 * coisa à outra.
 */

const produto = {
  id: 'p-1',
  name: 'Café',
  createdById: 'u-dono',
  status: ProductStatus.ACTIVE,
};

describe('ProductService', () => {
  const service = new ProductService();

  beforeEach(() => {
    jest.mocked(cacheService.get).mockResolvedValue(null);
    jest.mocked(cacheService.set).mockResolvedValue(undefined);
    jest.mocked(cacheService.delete).mockResolvedValue(undefined);
    jest.mocked(cacheService.deletePattern).mockResolvedValue(undefined);
    jest.mocked(productRepository.findById).mockResolvedValue(produto as never);
    jest.mocked(productRepository.update).mockResolvedValue(produto as never);
    jest.mocked(productRepository.create).mockResolvedValue(produto as never);
    jest.mocked(productRepository.softDelete).mockResolvedValue(undefined as never);
  });

  describe('createProduct', () => {
    it('should stamp the creator on the row', async () => {
      await service.createProduct({ name: 'Café', price: 24.9, stock: 10 }, 'u-dono');

      expect(productRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Café', createdById: 'u-dono' })
      );
    });

    it('should drop every cached listing after a create', async () => {
      await service.createProduct({ name: 'Café', price: 24.9, stock: 10 }, 'u-dono');

      expect(cacheService.deletePattern).toHaveBeenCalledWith('products:*');
    });
  });

  describe('getProducts', () => {
    const opcoes = { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'DESC' as const };

    it('should answer from cache without querying', async () => {
      jest.mocked(cacheService.get).mockResolvedValue({ data: [], meta: {} } as never);

      await service.getProducts(opcoes, {});

      expect(productRepository.paginateWithFilters).not.toHaveBeenCalled();
    });

    /**
     * A chave do cache tem que conter todo filtro que muda o resultado. Se um
     * filtro ficar de fora, uma busca devolve o resultado de outra.
     */
    it('should build a cache key that separates different filter combinations', async () => {
      jest.mocked(productRepository.paginateWithFilters).mockResolvedValue({
        data: [],
        meta: {},
      } as never);

      await service.getProducts(opcoes, { status: ProductStatus.ACTIVE, category: 'bebidas' });
      await service.getProducts(opcoes, { status: ProductStatus.ACTIVE, category: 'grãos' });
      await service.getProducts(opcoes, { search: 'café' });

      const chaves = jest.mocked(cacheService.set).mock.calls.map(([chave]) => chave);
      expect(new Set(chaves).size).toBe(3);
    });

    it('should cache the listing for a short window only', async () => {
      jest.mocked(productRepository.paginateWithFilters).mockResolvedValue({
        data: [],
        meta: {},
      } as never);

      await service.getProducts(opcoes, {});

      expect(cacheService.set).toHaveBeenCalledWith(expect.any(String), expect.anything(), 60);
    });
  });

  describe('getProductById', () => {
    it('should load with the creator joined and then cache it', async () => {
      jest.mocked(productRepository.findByIdWithCreator).mockResolvedValue(produto as never);

      await service.getProductById('p-1');

      expect(cacheService.set).toHaveBeenCalledWith('product:p-1', produto, 300);
    });

    it('should answer from cache without querying', async () => {
      jest.mocked(cacheService.get).mockResolvedValue(produto as never);

      await service.getProductById('p-1');

      expect(productRepository.findByIdWithCreator).not.toHaveBeenCalled();
    });

    it('should report a missing product as not found', async () => {
      jest.mocked(productRepository.findByIdWithCreator).mockResolvedValue(null as never);

      await expect(service.getProductById('p-x')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProduct: quem pode mexer', () => {
    it('should let the creator update their own product', async () => {
      await expect(
        service.updateProduct('p-1', { name: 'Novo' }, 'u-dono', UserRole.USER)
      ).resolves.toBeDefined();
    });

    it('should block a plain user from touching someone else product', async () => {
      await expect(
        service.updateProduct('p-1', { name: 'Novo' }, 'u-outro', UserRole.USER)
      ).rejects.toThrow(AuthorizationError);
      expect(productRepository.update).not.toHaveBeenCalled();
    });

    it('should let an admin update anything', async () => {
      await expect(
        service.updateProduct('p-1', { name: 'Novo' }, 'u-outro', UserRole.ADMIN)
      ).resolves.toBeDefined();
    });

    it('should let a manager update anything', async () => {
      await expect(
        service.updateProduct('p-1', { name: 'Novo' }, 'u-outro', UserRole.MANAGER)
      ).resolves.toBeDefined();
    });

    /**
     * Alterar o produto invalida duas coisas: o registro em si e toda listagem
     * que o continha. Esquecer a segunda é o defeito clássico deste padrão.
     */
    it('should invalidate both the single record and every listing', async () => {
      await service.updateProduct('p-1', { name: 'Novo' }, 'u-dono', UserRole.USER);

      expect(cacheService.delete).toHaveBeenCalledWith('product:p-1');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('products:*');
    });

    it('should refuse to update a product that does not exist', async () => {
      jest.mocked(productRepository.findById).mockResolvedValue(null as never);

      await expect(
        service.updateProduct('p-x', {}, 'u-dono', UserRole.ADMIN)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteProduct', () => {
    it('should soft delete and clear both caches', async () => {
      await service.deleteProduct('p-1', 'u-dono', UserRole.USER);

      expect(productRepository.softDelete).toHaveBeenCalledWith('p-1');
      expect(cacheService.delete).toHaveBeenCalledWith('product:p-1');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('products:*');
    });

    it('should block a plain user from deleting someone else product', async () => {
      await expect(service.deleteProduct('p-1', 'u-outro', UserRole.USER)).rejects.toThrow(
        AuthorizationError
      );
      expect(productRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should refuse to delete a product that does not exist', async () => {
      jest.mocked(productRepository.findById).mockResolvedValue(null as never);

      await expect(service.deleteProduct('p-x', 'u-dono', UserRole.ADMIN)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('updateProductImage', () => {
    it('should store the image url on the product', async () => {
      await service.updateProductImage('p-1', '/uploads/abc.webp', 'u-dono', UserRole.USER);

      expect(productRepository.update).toHaveBeenCalledWith('p-1', {
        imageUrl: '/uploads/abc.webp',
      });
    });

    it('should apply the same ownership rule as the other writes', async () => {
      await expect(
        service.updateProductImage('p-1', '/uploads/abc.webp', 'u-outro', UserRole.USER)
      ).rejects.toThrow(AuthorizationError);
    });

    it('should refuse when the product does not exist', async () => {
      jest.mocked(productRepository.findById).mockResolvedValue(null as never);

      await expect(
        service.updateProductImage('p-x', '/uploads/abc.webp', 'u-dono', UserRole.ADMIN)
      ).rejects.toThrow(NotFoundError);
    });
  });
});

describe('ProductController: saneamento da consulta', () => {
  const controller = new ProductController();

  function respostaEspia() {
    const status = jest.fn();
    const espia = { status, json: jest.fn(), send: jest.fn() };
    status.mockReturnValue(espia);
    return { ...espia, res: espia as unknown as Response };
  }

  function requisicaoDe(consulta: Record<string, string> = {}): Request {
    return {
      query: consulta,
      params: { id: 'p-1' },
      body: {},
      user: { id: 'u-dono', email: 'a@b.com', role: UserRole.USER },
    } as unknown as Request;
  }

  beforeEach(() => {
    jest.spyOn(ProductService.prototype, 'getProducts');
    jest.mocked(cacheService.get).mockResolvedValue({ data: [], meta: { total: 0 } } as never);
  });

  it('should default to the first page with twenty rows', async () => {
    const resposta = respostaEspia();

    await controller.getAll(requisicaoDe(), resposta.res);

    expect(resposta.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  /**
   * O teto do catálogo é cinquenta, mais baixo que o de usuários, porque cada
   * linha traz o criador junto. Cinquenta produtos são cinquenta junções.
   */
  it('should cap the page size at fifty', async () => {
    jest.mocked(cacheService.get).mockResolvedValue(null);
    jest.mocked(productRepository.paginateWithFilters).mockResolvedValue({
      data: [],
      meta: {},
    } as never);

    await controller.getAll(requisicaoDe({ limit: '5000' }), respostaEspia().res);

    const [, chamada] = jest.mocked(cacheService.set).mock.calls.at(-1)!;
    expect(chamada).toBeDefined();
    expect(jest.mocked(productRepository.paginateWithFilters).mock.calls.at(-1)![0]).toMatchObject({
      limit: 50,
    });
  });

  it('should floor the page at one instead of computing a negative offset', async () => {
    jest.mocked(cacheService.get).mockResolvedValue(null);
    jest.mocked(productRepository.paginateWithFilters).mockResolvedValue({
      data: [],
      meta: {},
    } as never);

    await controller.getAll(requisicaoDe({ page: '-3' }), respostaEspia().res);

    expect(jest.mocked(productRepository.paginateWithFilters).mock.calls.at(-1)![0]).toMatchObject({
      page: 1,
    });
  });

  it('should never let the page size drop below one', async () => {
    jest.mocked(cacheService.get).mockResolvedValue(null);
    jest.mocked(productRepository.paginateWithFilters).mockResolvedValue({
      data: [],
      meta: {},
    } as never);

    await controller.getAll(requisicaoDe({ limit: '0' }), respostaEspia().res);

    expect(jest.mocked(productRepository.paginateWithFilters).mock.calls.at(-1)![0]).toMatchObject({
      limit: 20,
    });
  });

  it('should answer a delete with 204 and no body', async () => {
    jest.mocked(productRepository.findById).mockResolvedValue(produto as never);
    const resposta = respostaEspia();

    await controller.delete(requisicaoDe(), resposta.res);

    expect(resposta.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    expect(resposta.send).toHaveBeenCalledWith();
  });

  it('should return the created product with 201', async () => {
    jest.mocked(productRepository.create).mockResolvedValue(produto as never);
    const resposta = respostaEspia();

    await controller.create(requisicaoDe(), resposta.res);

    expect(resposta.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(resposta.json).toHaveBeenCalledWith({ success: true, data: { product: produto } });
  });

  it('should read the product id from the path on getById', async () => {
    jest.mocked(cacheService.get).mockResolvedValue(produto as never);
    const resposta = respostaEspia();

    await controller.getById(requisicaoDe(), resposta.res);

    expect(resposta.json).toHaveBeenCalledWith({ success: true, data: { product: produto } });
  });

  it('should pass the caller identity and role through on update', async () => {
    jest.mocked(productRepository.findById).mockResolvedValue(produto as never);
    jest.mocked(productRepository.update).mockResolvedValue(produto as never);
    const resposta = respostaEspia();

    await controller.update(requisicaoDe(), resposta.res);

    expect(resposta.status).toHaveBeenCalledWith(HttpStatus.OK);
  });
});
