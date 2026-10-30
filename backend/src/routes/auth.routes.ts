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
import { passkeyController } from '@controllers/passkey.controller';
import {
  passkeyAuthenticationSchema,
  passkeyIdSchema,
  passkeyRegistrationSchema,
} from '@validators/passkey.validator';

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

/**
 * @swagger
 * /auth/passkeys/registration/options:
 *   post:
 *     tags: [Passkeys]
 *     summary: Start registering a passkey for the signed-in user
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/passkeys/registration/options',
  authenticate,
  passkeyController.registrationOptions.bind(passkeyController)
);

/**
 * @swagger
 * /auth/passkeys/registration/verify:
 *   post:
 *     tags: [Passkeys]
 *     summary: Save the passkey created by the authenticator
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/passkeys/registration/verify',
  authenticate,
  validate(passkeyRegistrationSchema),
  passkeyController.verifyRegistration.bind(passkeyController)
);

/**
 * @swagger
 * /auth/passkeys/authentication/options:
 *   post:
 *     tags: [Passkeys]
 *     summary: Start a passkey sign-in
 */
router.post(
  '/passkeys/authentication/options',
  authRateLimiter(),
  passkeyController.authenticationOptions.bind(passkeyController)
);

/**
 * @swagger
 * /auth/passkeys/authentication/verify:
 *   post:
 *     tags: [Passkeys]
 *     summary: Sign in with a passkey
 */
router.post(
  '/passkeys/authentication/verify',
  authRateLimiter(),
  validate(passkeyAuthenticationSchema),
  passkeyController.verifyAuthentication.bind(passkeyController)
);

/**
 * @swagger
 * /auth/passkeys:
 *   get:
 *     tags: [Passkeys]
 *     summary: List the signed-in user's passkeys
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/passkeys',
  authenticate,
  passkeyController.list.bind(passkeyController)
);

/**
 * @swagger
 * /auth/passkeys/{id}:
 *   delete:
 *     tags: [Passkeys]
 *     summary: Remove one of the signed-in user's passkeys
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/passkeys/:id',
  authenticate,
  validate(passkeyIdSchema, 'params'),
  passkeyController.remove.bind(passkeyController)
);

export default router;
