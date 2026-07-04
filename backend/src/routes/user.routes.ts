import { Router } from 'express';
import { userController } from '@controllers/user.controller';
import { authenticate, authorize } from '@middlewares/auth.middleware';
import { validate, sanitizeBody } from '@middlewares/validation.middleware';
import { UserRole } from '@models/user.entity';
import { changePasswordSchema } from '@validators/auth.validator';
import { z } from 'zod';

const router = Router();

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes')
    .trim()
    .optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s()-]{7,20}$/, 'Invalid phone number')
    .optional(),
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
