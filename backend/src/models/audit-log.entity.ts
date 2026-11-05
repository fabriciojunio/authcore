import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

// Uma linha da trilha de auditoria. A tabela existe desde a migração inicial.
// Nunca guarda senha, token, código TOTP nem o e-mail digitado num login que
// falhou: só o que permite reconstruir o que aconteceu, por quem e de onde.
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  // A tabela não tem chave estrangeira: o registro sobrevive à exclusão do usuário.
  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ length: 100 })
  action!: string;

  @Column({ name: 'table_name', type: 'varchar', length: 100, nullable: true })
  tableName!: string | null;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId!: string | null;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
