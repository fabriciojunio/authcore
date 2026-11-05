import { Request, Response } from 'express';
import { auditService, AuditAction } from '@services/audit.service';
import { HttpStatus, ValidationError } from '@errors/AppError';

const ACOES = new Set<string>(Object.values(AuditAction));

export class AuditController {
  async list(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100);
    const action = req.query['action'] as string | undefined;

    if (page < 1) throw new ValidationError('Page must be at least 1');
    if (limit < 1) throw new ValidationError('Limit must be at least 1');
    // Lista fechada: o filtro só aceita ações que a aplicação grava.
    if (action !== undefined && !ACOES.has(action)) throw new ValidationError('Unknown audit action');

    const result = await auditService.list({ page, limit, action });
    res.status(HttpStatus.OK).json({
      success: true,
      data: result.data.map((linha) => ({
        id: linha.id,
        action: linha.action,
        userId: linha.userId,
        actor: linha.user?.email ?? null,
        ipAddress: linha.ipAddress,
        details: linha.newValues,
        createdAt: linha.createdAt,
      })),
      meta: result.meta,
    });
  }
}

export const auditController = new AuditController();
