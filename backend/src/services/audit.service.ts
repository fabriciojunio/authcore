import { isIP } from 'net';
import { auditRepository, AuditQuery } from '@repositories/audit.repository';
import { PaginatedResult } from '@repositories/base.repository';
import { AuditLog } from '@models/audit-log.entity';
import { logger } from '@config/logger';

export enum AuditAction {
  REGISTER = 'auth.register',
  REGISTER_EXISTING = 'auth.register_existing',
  LOGIN = 'auth.login',
  LOGIN_FAILED = 'auth.login_failed',
  LOGOUT = 'auth.logout',
  REFRESH_REUSE = 'auth.refresh_reuse',
  PASSWORD_CHANGE = 'user.password_change',
  ACCOUNT_DELETE = 'user.delete',
  PASSKEY_ADD = 'passkey.register',
  PASSKEY_REMOVE = 'passkey.remove',
}

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEvent extends AuditContext {
  action: AuditAction;
  userId?: string | null;
  details?: Record<string, string>;
}

// User-Agent vem do cliente e não tem limite: guardar inteiro deixaria qualquer um
// encher a tabela com uma requisição.
const MAX_USER_AGENT = 300;

export class AuditService {
  // Gravar a trilha não pode derrubar o login: se o banco falhar aqui, o evento
  // vai para o log da aplicação e a requisição segue.
  async record(event: AuditEvent): Promise<void> {
    try {
      await auditRepository.create({
        action: event.action,
        userId: event.userId ?? null,
        tableName: event.userId ? 'users' : null,
        recordId: event.userId ?? null,
        newValues: event.details ?? null,
        // A coluna é INET: um valor que não é IP faria o INSERT falhar.
        ipAddress: event.ipAddress && isIP(event.ipAddress) ? event.ipAddress : null,
        userAgent: event.userAgent ? event.userAgent.slice(0, MAX_USER_AGENT) : null,
      });
    } catch (error) {
      // Só o nome do erro: o erro do driver carrega os parâmetros do INSERT, e o IP é dado pessoal.
      logger.error('Audit write failed', {
        action: event.action,
        userId: event.userId ?? null,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  async list(query: AuditQuery): Promise<PaginatedResult<AuditLog>> {
    return auditRepository.list(query);
  }
}

export const auditService = new AuditService();
