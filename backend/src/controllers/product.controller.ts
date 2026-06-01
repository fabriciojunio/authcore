import path from 'path';
import { Request, Response } from 'express';
import { productService } from '@services/product.service';
import type { CreateProductDto, UpdateProductDto } from '@services/product.service';
import { HttpStatus, ValidationError } from '@errors/AppError';
import { upload, processImage, getPublicFilePath } from '@services/upload.service';
import { ProductStatus } from '@models/product.entity';

export class ProductController {
  async create(req: Request, res: Response): Promise<void> {
    const product = await productService.createProduct(req.body as CreateProductDto, req.user!.id);
    res.status(HttpStatus.CREATED).json({ success: true, data: { product } });
  }

  async getAll(req: Request, res: Response): Promise<void> {
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 20));
    const sortBy = (req.query['sortBy'] as string) || 'createdAt';
    const sortOrder = ((req.query['sortOrder'] as string)?.toUpperCase() || 'DESC') as 'ASC' | 'DESC';

    const result = await productService.getProducts(
      { page, limit, sortBy, sortOrder },
      {
        status: req.query['status'] as ProductStatus | undefined,
        category: req.query['category'] as string | undefined,
        search: req.query['search'] as string | undefined,
      }
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const product = await productService.getProductById(req.params['id']);
    res.status(HttpStatus.OK).json({ success: true, data: { product } });
  }

  async update(req: Request, res: Response): Promise<void> {
    const product = await productService.updateProduct(
      req.params['id'],
      req.body as UpdateProductDto,
      req.user!.id,
      req.user!.role
    );
    res.status(HttpStatus.OK).json({ success: true, data: { product } });
  }

  async delete(req: Request, res: Response): Promise<void> {
    await productService.deleteProduct(req.params['id'], req.user!.id, req.user!.role);
    res.status(HttpStatus.NO_CONTENT).send();
  }

  uploadImage = [
    upload.single('image'),
    async (req: Request, res: Response): Promise<void> => {
      if (!req.file) {
        throw new ValidationError('No image file provided');
      }

      const processedPath = await processImage(req.file.path, {
        width: 800,
        quality: 85,
        format: 'webp',
      });

      const imageUrl = getPublicFilePath(path.basename(processedPath));

      const product = await productService.updateProductImage(
        req.params['id'],
        imageUrl,
        req.user!.id,
        req.user!.role
      );

      res.status(HttpStatus.OK).json({ success: true, data: { product } });
    },
  ];
}

export const productController = new ProductController();
