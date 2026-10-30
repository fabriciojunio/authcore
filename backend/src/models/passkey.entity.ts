import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

// Uma passkey (credencial WebAuthn) de um usuário. Só a chave pública fica aqui:
// a privada nunca sai do aparelho, então vazar esta tabela não dá acesso a nada.
@Entity('passkeys')
export class Passkey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  // Identificador da credencial em base64url, como o navegador o devolve.
  @Index({ unique: true })
  @Column({ name: 'credential_id', length: 1024 })
  credentialId!: string;

  @Column({ name: 'public_key', type: 'bytea' })
  publicKey!: Buffer;

  // Contador de assinaturas. Se voltar para trás, a credencial foi clonada.
  @Column({ type: 'bigint', default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  counter!: number;

  @Column({ type: 'simple-array', nullable: true })
  transports?: string[] | null;

  @Column({ length: 100 })
  name!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt?: Date | null;
}
