import { Router } from 'express';
import { userController } from '@controllers/user.controller';
import { authenticate, authorize } from '@middlewares/auth.middleware';
import { validate, sanitizeBody } from '@middlewares/validation.middleware';
import { UserRole } from '@models/user.entity';
import { z } from 'zod';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: z.string().max(20).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmNewPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});

// All user routes require authentication
router.use(authenticate);

router.get('/profile', userController.getProfile.bind(userController));

router.patch(
  '/profile',
  sanitizeBody,
  validate(updateProfileSchema),
  userController.updateProfile.bind(userController)
);

router.patch(
  '/change-password',
  sanitizeBody,
  validate(changePasswordSchema),
  userController.changePassword.bind(userController)
);

router.delete('/account', userController.deleteAccount.bind(userController));

// Admin only routes
router.get(
  '/',
  authorize(UserRole.ADMIN),
  userController.getAllUsers.bind(userController)
);

router.get(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  userController.getUserById.bind(userController)
);

export default router;
