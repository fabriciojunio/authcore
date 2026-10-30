import { User, UserStatus } from '@models/user.entity';
import { IsNull } from 'typeorm';
import { BaseRepository } from './base.repository';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
  }

  async completeLogin(user: User, refreshTokenHash: string): Promise<boolean> {
    const result = await this.repository.createQueryBuilder()
      .update(User)
      .set({ refreshTokenHash, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where('id = :id AND password = :password AND session_version = :version', {
        id: user.id, password: user.password, version: user.sessionVersion,
      })
      .andWhere('status = :status AND deleted_at IS NULL', { status: UserStatus.ACTIVE })
      .andWhere('(locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)')
      .execute();
    return result.affected === 1;
  }

  async recordFailedLogin(user: User): Promise<void> {
    await this.repository.createQueryBuilder()
      .update(User)
      .set({
        failedLoginAttempts: () => '"failed_login_attempts" + 1',
        lockedUntil: () => 'CASE WHEN "failed_login_attempts" + 1 >= 5 THEN CURRENT_TIMESTAMP + INTERVAL \'15 minutes\' ELSE "locked_until" END',
      })
      .where('id = :id AND password = :password AND session_version = :version', {
        id: user.id, password: user.password, version: user.sessionVersion,
      })
      .execute();
  }

  async changePasswordIfCurrent(user: User, passwordHash: string): Promise<boolean> {
    const result = await this.repository.update(
      { id: user.id, password: user.password, sessionVersion: user.sessionVersion, deletedAt: IsNull() },
      { password: passwordHash, refreshTokenHash: null, sessionVersion: () => '"session_version" + 1' }
    );
    return result.affected === 1;
  }

  async rotateRefreshToken(id: string, currentHash: string, nextHash: string, sessionVersion: number): Promise<boolean> {
    const result = await this.repository.update(
      { id, refreshTokenHash: currentHash, sessionVersion },
      { refreshTokenHash: nextHash }
    );
    return result.affected === 1;
  }

  async revokeSessions(id: string): Promise<void> {
    await this.repository.createQueryBuilder()
      .update(User)
      .set({ refreshTokenHash: null, sessionVersion: () => '"session_version" + 1' })
      .where('id = :id', { id })
      .execute();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.refreshTokenHash')
      .addSelect('user.twoFactorSecret')
      .addSelect('user.failedLoginAttempts')
      .addSelect('user.lockedUntil')
      .where('user.email = :email', { email: email.toLowerCase().trim() })
      .getOne();
  }

  // Login por passkey: carrega os mesmos campos do login por senha, porque o
  // completeLogin confere senha e versão de sessão para não regravar sobre uma
  // troca de senha concorrente.
  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.failedLoginAttempts')
      .addSelect('user.lockedUntil')
      .where('user.id = :id', { id })
      .getOne();
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.passwordResetToken')
      .addSelect('user.passwordResetExpires')
      .where('user.passwordResetToken = :token', { token })
      .andWhere('user.passwordResetExpires > :now', { now: new Date() })
      .getOne();
  }
}

export const userRepository = new UserRepository();
