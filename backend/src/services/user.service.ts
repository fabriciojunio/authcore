import { userRepository } from '@repositories/user.repository';
import { cacheService } from './cache.service';
import { User, UserRole } from '@models/user.entity';
import { NotFoundError, AuthorizationError, ValidationError } from '@errors/AppError';
import { logger } from '@config/logger';
import { PaginatedResult, PaginationOptions } from '@repositories/base.repository';

export interface UpdateProfileDto {
  name?: string;
  phone?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export class UserService {
  async getProfile(userId: string): Promise<User> {
    const cacheKey = `user:${userId}`;
    const cached = await cacheService.get<User>(cacheKey);
    if (cached) return cached;

    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    await cacheService.set(cacheKey, user.toSafeObject(), 300); // 5 min cache
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const updated = await userRepository.update(userId, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.phone && { phone: dto.phone }),
    });

    await cacheService.delete(`user:${userId}`);
    logger.info('User profile updated', { userId });
    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const baseUser = await userRepository.findById(userId);
    if (!baseUser) throw new NotFoundError('User');

    const user = await userRepository.findByEmailWithPassword(baseUser.email);
    if (!user) throw new NotFoundError('User');

    const isValid = await user.comparePassword(dto.currentPassword);
    if (!isValid) throw new ValidationError('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new ValidationError('New password must be different from current password');
    }

    user.password = dto.newPassword;
    await userRepository.save(user);

    // Invalidate all sessions after password change
    await cacheService.delete(`user:${userId}`);
    logger.info('User password changed', { userId });
  }

  async getAllUsers(
    options: PaginationOptions,
    requestingUserRole: UserRole
  ): Promise<PaginatedResult<User>> {
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new AuthorizationError('Only admins can list all users');
    }

    return userRepository.paginate(options);
  }

  async getUserById(id: string, requestingUserId: string, requestingUserRole: UserRole): Promise<User> {
    if (id !== requestingUserId && requestingUserRole !== UserRole.ADMIN) {
      throw new AuthorizationError('Cannot access other users profiles');
    }

    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    await userRepository.softDelete(userId);
    await cacheService.delete(`user:${userId}`);
    logger.info('User account deleted', { userId });
  }
}

export const userService = new UserService();
