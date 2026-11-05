import type { Request } from 'express';
import type { AuditContext } from '@services/audit.service';

// O IP é o que o Express resolveu com a lista de proxies confiáveis, e não o
// X-Forwarded-For cru, que o cliente escreve como quiser.
export function auditContext(req: Request): AuditContext {
  const userAgent = req.headers?.['user-agent'];
  return {
    ipAddress: req.ip ?? req.socket?.remoteAddress,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
  };
}
