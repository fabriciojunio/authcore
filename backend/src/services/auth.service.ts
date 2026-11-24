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
import { auditService, AuditAction, AuditContext } from './audit.service';

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

const TOTP_STEP_SECONDS = 30;

export class AuthService {
  // Resposta idêntica em qualquer cenário de cadastro para não revelar
  // se um e-mail já existe (proteção contra enumeração de usuários).
  private static readonly REGISTER_MESSAGE =
    'Registration request received. Account access requires verification and activation.';

  // Hash fictício usado para equalizar o tempo de resposta quando o
  // usuário não existe, evitando enumeração por timing attack.
  private dummyHash: string | null = null;

  async register(dto: RegisterDto, context: AuditContext = {}): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const existing = await userRepository.findByEmail(email);

    if (existing) {
      // Não revela que o e-mail já existe; um e-mail de "conta já cadastrada"
      // seria enviado em produção. O hash abaixo é jogado fora: gasta o mesmo
      // tempo do @BeforeInsert do caminho novo, senão o relógio contaria o que a
      // mensagem esconde (AUTHCORE-001).
      await bcrypt.hash(dto.password, config.security.bcryptRounds);
      logger.warn('Registration attempt for existing email', { userId: existing.id });
      await auditService.record({ action: AuditAction.REGISTER_EXISTING, userId: existing.id, ...context });
      return { message: AuthService.REGISTER_MESSAGE };
    }

    const user = await userRepository.create({
      name: dto.name.trim(),
      email,
      password: dto.password,
      status: UserStatus.PENDING_VERIFICATION,
    });

    // In production: send verification email here
    logger.info('User registered', { userId: user.id });
    await auditService.record({ action: AuditAction.REGISTER, userId: user.id, ...context });

    return { message: AuthService.REGISTER_MESSAGE };
  }

  async login(dto: LoginDto, ipAddress: string, userAgent?: string): Promise<AuthResult> {
    const context: AuditContext = { ipAddress, userAgent };
    // O e-mail digitado não vai para a trilha: num login que recordFailure ele pode ser
    // de outra pessoa, ou a própria senha colada no campo errado.
    const recordFailure = (userId: string | null, reason: string): Promise<void> =>
      auditService.record({ action: AuditAction.LOGIN_FAILED, userId, details: { reason }, ...context });

    const user = await userRepository.findByEmailWithPassword(dto.email);

    // Consistent timing to prevent user enumeration
    if (!user) {
      await this.simulatePasswordCheck(dto.password);
      await recordFailure(null, 'unknown_user');
      throw new AuthenticationError('Invalid credentials');
    }

    // Mesma mensagem e mesmo custo da senha errada: só e-mail cadastrado chega a
    // bloquear, então qualquer diferença aqui confirma que a conta existe
    // (AUTHCORE-003). O motivo real fica na trilha de auditoria.
    if (user.isLocked()) {
      await this.simulatePasswordCheck(dto.password);
      await recordFailure(user.id, 'locked');
      throw new AuthenticationError('Invalid credentials');
    }

    const isPasswordValid = await user.comparePassword(dto.password);

    if (!isPasswordValid) {
      await userRepository.recordFailedLogin(user);
      logger.warn('Failed login attempt', { userId: user.id, ipAddress });
      await recordFailure(user.id, 'bad_password');
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.isEmailVerified()) {
      await recordFailure(user.id, 'unverified');
      throw new AuthenticationError('Please verify your email before logging in');
    }

    if (user.status !== UserStatus.ACTIVE) {
      await recordFailure(user.id, 'inactive');
      throw new AuthenticationError('Account is not active');
    }

    if (user.twoFactorEnabled) {
      if (!dto.totp) {
        throw new ValidationError('Two-factor authentication code required');
      }
      const step = this.matchTotpStep(user.twoFactorSecret!, dto.totp);
      // RFC 6238, seção 5.2: cada código vale uma vez. O passo só é aceito se for
      // maior que o último usado, numa única instrução no banco, então duas
      // requisições simultâneas com o mesmo código não passam as duas (AUTHCORE-002).
      const fresh = step !== null && (await userRepository.consumeTotpStep(user.id, step));
      if (!fresh) {
        await userRepository.recordFailedLogin(user);
        await recordFailure(user.id, step === null ? 'bad_totp' : 'totp_replay');
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
    await auditService.record({ action: AuditAction.LOGIN, userId: user.id, details: { method: 'password' }, ...context });

    return { user: user.toSafeObject(), tokens };
  }

  async refresh(refreshToken: string, context: AuditContext = {}): Promise<TokenPair> {
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
      await auditService.record({ action: AuditAction.REFRESH_REUSE, userId: user.id, ...context });
      throw new AuthenticationError('Invalid refresh token');
    }

    return tokens;
  }

  async logout(userId: string, refreshToken: string, context: AuditContext = {}): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const tokenHash = tokenService.hashToken(refreshToken);
    await cacheService.blacklistToken(tokenHash, 7 * 24 * 60 * 60);

    await userRepository.revokeSessions(userId);

    // Invalidate user cache (mesma chave usada em auth.middleware.ts)
    await cacheService.delete(`auth:${userId}`);
    logger.info('User logged out', { userId });
    await auditService.record({ action: AuditAction.LOGOUT, userId, ...context });
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

  // Devolve o passo de tempo a que o código pertence, ou null se não confere.
  private matchTotpStep(secret: string, token: string): number | null {
    // Um relógio só para conferir e para calcular o passo: lendo duas vezes, a virada de
    // passo entre as leituras gravaria o passo errado.
    const time = Math.floor(Date.now() / 1000);
    const match = speakeasy.totp.verifyDelta({
      time,
      secret,
      encoding: 'base32',
      token,
      // Janela de 1 passo (+/-30s) reduz a superfície de reuso/força bruta de
      // códigos TOTP mantendo tolerância a relógios levemente dessincronizados.
      window: 1,
    });
    return match ? Math.floor(time / TOTP_STEP_SECONDS) + match.delta : null;
  }
}

export const authService = new AuthService();
