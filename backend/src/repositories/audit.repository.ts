import { AuditLog } from '@models/audit-log.entity';
import { BaseRepository, PaginatedResult } from './base.repository';

export interface AuditQuery {
  page: number;
  limit: number;
  action?: string;
}

export class AuditRepository extends BaseRepository<AuditLog> {
  constructor() {
    super(AuditLog);
  }

  // Mais recente primeiro, com o e-mail de quem agiu. O filtro por ação vai como
  // parâmetro da consulta, nunca concatenado.
  async list(query: AuditQuery): Promise<PaginatedResult<AuditLog>> {
    return this.paginate(
      { page: query.page, limit: query.limit, sortBy: 'createdAt', sortOrder: 'DESC' },
      (qb) => {
        const comUsuario = qb.leftJoinAndSelect('entity.user', 'user');
        return query.action ? comUsuario.andWhere('entity.action = :action', { action: query.action }) : comUsuario;
      }
    );
  }
}

export const auditRepository = new AuditRepository();
