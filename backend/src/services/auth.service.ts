import speakeasy from 'speakeasy';
import { userRepository } from '@repositories/user.repository';
import { tokenService } from './token.service';
import { cacheService } from './cache.service';
import { User, UserStatus } from '@models/user.entity';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@errors/AppError';
import { logger } from '@config/logger';
import { TokenPair } from './token.service';

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
  totp?: string;
}

export interface AuthResult {
  user: ReturnType<User['toSafeObject']>;
  tokens: TokenPair;
}

export class AuthService {
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError('Email already in use');
    }

    const user = await userRepository.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      password: dto.password,
      status: UserStatus.PENDING_VERIFICATION,
    });

    // In production: send verification email here
    logger.info('User registered', { userId: user.id, email: user.email });

    return { message: 'Registration successful. Please verify your email.' };
  }

  async login(dto: LoginDto, ipAddress: string): Promise<AuthResult> {
    const user = await userRepository.findByEmailWithPassword(dto.email);

    // Consistent timing to prevent user enumeration
    if (!user) {
      await this.simulatePasswordCheck();
      throw new AuthenticationError('Invalid credentials');
    }

    if (user.isLocked()) {
      throw new AuthenticationError(
        'Account temporarily locked due to too many failed attempts. Try again later.'
      );
    }

    const isPasswordValid = await user.comparePassword(dto.password);

    if (!isPasswordValid) {
      user.incrementFailedAttempts();
      await userRepository.save(user);
      logger.warn('Failed login attempt', { userId: user.id, ipAddress });
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.isEmailVerified()) {
      throw new AuthenticationError('Please verify your email before logging in');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AuthenticationError('Account is not active');
    }

    if (user.twoFactorEnabled) {
      if (!dto.totp) {
        throw new ValidationError('Two-factor authentication code required');
      }
      const isValidTotp = await this.verifyTotp(user.twoFactorSecret!, dto.totp);
      if (!isValidTotp) {
        throw new AuthenticationError('Invalid two-factor code');
      }
    }

    // Reset failed attempts on success
    user.resetFailedAttempts();
    user.lastLoginAt = new Date();

    const tokens = tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    user.refreshTokenHash = tokenService.hashToken(tokens.refreshToken);
    await userRepository.save(user);

    logger.info('User logged in', { userId: user.id, ipAddress });

    return { user: user.toSafeObject(), tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = tokenService.verifyRefreshToken(refreshToken);

    const isBlacklisted = await cacheService.isTokenBlacklisted(
      tokenService.hashToken(refreshToken)
    );
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    const user = await userRepository.findById(payload.sub);
    if (!user) throw new AuthenticationError('User not found');
    if (!user.isActive()) throw new AuthenticationError('Account is not active');

    const tokenHash = tokenService.hashToken(refreshToken);
    if (user.refreshTokenHash !== tokenHash) {
      // Possible token reuse attack - invalidate all sessions
      user.refreshTokenHash = undefined;
      await userRepository.save(user);
      logger.warn('Possible refresh token reuse attack', { userId: user.id });
      throw new AuthenticationError('Invalid refresh token');
    }

    const tokens = tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Blacklist old refresh token and save new one
    await cacheService.blacklistToken(tokenHash, 7 * 24 * 60 * 60);
    user.refreshTokenHash = tokenService.hashToken(tokens.refreshToken);
    await userRepository.save(user);

    return tokens;
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const tokenHash = tokenService.hashToken(refreshToken);
    await cacheService.blacklistToken(tokenHash, 7 * 24 * 60 * 60);

    user.refreshTokenHash = undefined;
    await userRepository.save(user);

    // Invalidate user cache (mesma chave usada em auth.middleware.ts)
    await cacheService.delete(`auth:${userId}`);
    logger.info('User logged out', { userId });
  }

  private async simulatePasswordCheck(): Promise<void> {
    // Prevent timing attacks by simulating bcrypt time
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 100));
  }

  private async verifyTotp(secret: string, token: string): Promise<boolean> {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });
  }
}

export const authService = new AuthService();
