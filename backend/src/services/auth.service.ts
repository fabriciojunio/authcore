import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { config } from '@config/app.config';
import { userRepository } from '@repositories/user.repository';
import { tokenService } from './token.service';
import { cacheService } from './cache.service';
import { User, UserStatus } from '@models/user.entity';
import {
  AuthenticationError,
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
  // Resposta idêntica em qualquer cenário de cadastro para não revelar
  // se um e-mail já existe (proteção contra enumeração de usuários).
  private static readonly REGISTER_MESSAGE =
    'Registration request received. Account access requires verification and activation.';

  // Hash fictício usado para equalizar o tempo de resposta quando o
  // usuário não existe, evitando enumeração por timing attack.
  private dummyHash: string | null = null;

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const existing = await userRepository.findByEmail(email);

    if (existing) {
      // Não revela que o e-mail já existe; um e-mail de "conta já cadastrada"
      // seria enviado em produção.
      logger.warn('Registration attempt for existing email', { email });
      return { message: AuthService.REGISTER_MESSAGE };
    }

    const user = await userRepository.create({
      name: dto.name.trim(),
      email,
      password: dto.password,
      status: UserStatus.PENDING_VERIFICATION,
    });

    // In production: send verification email here
    logger.info('User registered', { userId: user.id, email: user.email });

    return { message: AuthService.REGISTER_MESSAGE };
  }

  async login(dto: LoginDto, ipAddress: string): Promise<AuthResult> {
    const user = await userRepository.findByEmailWithPassword(dto.email);

    // Consistent timing to prevent user enumeration
    if (!user) {
      await this.simulatePasswordCheck(dto.password);
      throw new AuthenticationError('Invalid credentials');
    }

    if (user.isLocked()) {
      throw new AuthenticationError(
        'Account temporarily locked due to too many failed attempts. Try again later.'
      );
    }

    const isPasswordValid = await user.comparePassword(dto.password);

    if (!isPasswordValid) {
      await userRepository.recordFailedLogin(user);
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
      const isValidTotp = this.verifyTotp(user.twoFactorSecret!, dto.totp);
      if (!isValidTotp) {
        await userRepository.recordFailedLogin(user);
        throw new AuthenticationError('Invalid two-factor code');
      }
    }

    const tokens = tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    // Não regrava uma entidade desatualizada sobre uma troca de senha concorrente.
    const completed = await userRepository.completeLogin(user, tokenService.hashToken(tokens.refreshToken));
    if (!completed) throw new AuthenticationError('Credentials changed. Please sign in again');
    user.resetFailedAttempts();
    user.lastLoginAt = new Date();

    logger.info('User logged in', { userId: user.id, ipAddress });

    return { user: user.toSafeObject(), tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = tokenService.verifyRefreshToken(refreshToken);

    const user = await userRepository.findById(payload.sub);
    if (!user) throw new AuthenticationError('User not found');
    if (!user.isActive()) throw new AuthenticationError('Account is not active');

    const tokenHash = tokenService.hashToken(refreshToken);
    if ((payload.sessionVersion ?? 0) !== user.sessionVersion) {
      throw new AuthenticationError('Invalid refresh token');
    }

    const tokens = tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    // Compare-and-swap no banco: duas requisições não consomem o mesmo token.
    const rotated = await userRepository.rotateRefreshToken(
      user.id, tokenHash, tokenService.hashToken(tokens.refreshToken), user.sessionVersion
    );
    if (!rotated) {
      await userRepository.revokeSessions(user.id);
      await cacheService.delete(`auth:${user.id}`);
      logger.warn('Possible refresh token reuse attack', { userId: user.id });
      throw new AuthenticationError('Invalid refresh token');
    }

    return tokens;
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const tokenHash = tokenService.hashToken(refreshToken);
    await cacheService.blacklistToken(tokenHash, 7 * 24 * 60 * 60);

    await userRepository.revokeSessions(userId);

    // Invalidate user cache (mesma chave usada em auth.middleware.ts)
    await cacheService.delete(`auth:${userId}`);
    logger.info('User logged out', { userId });
  }

  private async getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      // Gerado com o mesmo custo de bcrypt configurado para que o tempo de
      // verificação seja indistinguível do de um usuário real.
      this.dummyHash = await bcrypt.hash(
        'authcore-timing-safe-dummy-password',
        config.security.bcryptRounds
      );
    }
    return this.dummyHash;
  }

  private async simulatePasswordCheck(candidate: string): Promise<void> {
    // Executa um bcrypt.compare real contra um hash fictício. O custo de CPU
    // é idêntico ao caminho de um usuário existente, eliminando o vazamento de
    // tempo que permitiria enumerar quais e-mails estão cadastrados.
    const dummy = await this.getDummyHash();
    await bcrypt.compare(candidate, dummy);
  }

  private verifyTotp(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      // Janela de 1 passo (+/-30s) reduz a superfície de reuso/força bruta de
      // códigos TOTP mantendo tolerância a relógios levemente dessincronizados.
      window: 1,
    });
  }
}

export const authService = new AuthService();
