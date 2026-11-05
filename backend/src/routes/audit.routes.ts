import { Router } from 'express';
import { auditController } from '@controllers/audit.controller';
import { authenticate, authorize } from '@middlewares/auth.middleware';
import { UserRole } from '@models/user.entity';

const router = Router();

// A trilha mostra quem tentou entrar em qual conta e de onde: só administrador lê.
router.get('/', authenticate, authorize(UserRole.ADMIN), auditController.list.bind(auditController));

export default router;
