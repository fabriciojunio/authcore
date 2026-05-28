import { Router } from 'express';
import { authController } from '@controllers/auth.controller';
import { authenticate } from '@middlewares/auth.middleware';
import { validate, sanitizeBody } from '@middlewares/validation.middleware';
import { authRateLimiter } from '@middlewares/security.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '@validators/auth.validator';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, confirmPassword]
 *             properties:
 *               name: { type: string, example: "John Doe" }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               confirmPassword: { type: string }
 *     responses:
 *       201: { description: Registration successful }
 *       409: { description: Email already in use }
 *       422: { description: Validation error }
 */
router.post(
  '/register',
  authRateLimiter(),
  sanitizeBody,
  validate(registerSchema),
  authController.register.bind(authController)
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login with email and password
 */
router.post(
  '/login',
  authRateLimiter(),
  sanitizeBody,
  validate(loginSchema),
  authController.login.bind(authController)
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token
 */
router.post(
  '/refresh',
  authRateLimiter(),
  validate(refreshTokenSchema),
  authController.refresh.bind(authController)
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout and invalidate tokens
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/logout',
  authenticate,
  authController.logout.bind(authController)
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get current authenticated user info
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/me',
  authenticate,
  authController.me.bind(authController)
);

export default router;
