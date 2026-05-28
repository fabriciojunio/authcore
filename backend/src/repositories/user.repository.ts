import { User } from '@models/user.entity';
import { BaseRepository } from './base.repository';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
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
