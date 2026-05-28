import { Router } from 'express';
import { productController } from '@controllers/product.controller';
import { authenticate, authorize } from '@middlewares/auth.middleware';
import { validate, sanitizeBody } from '@middlewares/validation.middleware';
import { UserRole } from '@models/user.entity';
import { z } from 'zod';

const router = Router();

const createProductSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  description: z.string().max(5000).optional(),
  price: z.number().min(0).max(999999.99),
  stock: z.number().int().min(0),
  sku: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
});

const updateProductSchema = createProductSchema.partial();

router.use(authenticate);

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products with pagination and filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, draft] }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated list of products }
 */
router.get('/', productController.getAll.bind(productController));

router.get('/:id', productController.getById.bind(productController));

/**
 * @swagger
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  sanitizeBody,
  validate(createProductSchema),
  productController.create.bind(productController)
);

router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER),
  sanitizeBody,
  validate(updateProductSchema),
  productController.update.bind(productController)
);

router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER),
  productController.delete.bind(productController)
);

router.post(
  '/:id/image',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER),
  ...(Array.isArray(productController.uploadImage)
    ? productController.uploadImage
    : [productController.uploadImage])
);

export default router;
