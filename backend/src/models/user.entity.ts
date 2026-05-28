import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import bcrypt from 'bcryptjs';
import { config } from '@config/app.config';
import { Exclude } from 'class-transformer';

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ unique: true, length: 255 })
  email!: string;

  @Column()
  @Exclude()
  password!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING_VERIFICATION })
  status!: UserStatus;

  @Column({ nullable: true, name: 'avatar_url', length: 500 })
  avatarUrl?: string;

  @Column({ nullable: true, name: 'phone', length: 20 })
  phone?: string;

  @Column({ default: false, name: 'two_factor_enabled' })
  @Exclude()
  twoFactorEnabled!: boolean;

  @Column({ nullable: true, name: 'two_factor_secret' })
  @Exclude()
  twoFactorSecret?: string;

  @Column({ nullable: true, name: 'email_verified_at', type: 'timestamp' })
  emailVerifiedAt?: Date;

  @Column({ nullable: true, name: 'last_login_at', type: 'timestamp' })
  lastLoginAt?: Date;

  @Column({ default: 0, name: 'failed_login_attempts' })
  @Exclude()
  failedLoginAttempts!: number;

  @Column({ nullable: true, name: 'locked_until', type: 'timestamp' })
  @Exclude()
  lockedUntil?: Date;

  @Column({ nullable: true, name: 'refresh_token_hash' })
  @Exclude()
  refreshTokenHash?: string;

  @Column({ nullable: true, name: 'password_reset_token' })
  @Exclude()
  passwordResetToken?: string;

  @Column({ nullable: true, name: 'password_reset_expires', type: 'timestamp' })
  @Exclude()
  passwordResetExpires?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  @Exclude()
  deletedAt?: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, config.security.bcryptRounds);
    }
  }

  async comparePassword(plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, this.password);
  }

  isLocked(): boolean {
    return !!(this.lockedUntil && this.lockedUntil > new Date());
  }

  isEmailVerified(): boolean {
    return !!this.emailVerifiedAt;
  }

  isActive(): boolean {
    return this.status === UserStatus.ACTIVE && !this.isLocked();
  }

  incrementFailedAttempts(): void {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
      const lockDuration = 15 * 60 * 1000; // 15 minutes
      this.lockedUntil = new Date(Date.now() + lockDuration);
    }
  }

  resetFailedAttempts(): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = undefined;
  }

  toSafeObject() {
    const { password, refreshTokenHash, twoFactorSecret, ...safe } = this;
    void password;
    void refreshTokenHash;
    void twoFactorSecret;
    return safe;
  }
}
