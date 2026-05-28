import { AuthService } from '../../src/services/auth.service';
import { userRepository } from '../../src/repositories/user.repository';
import { tokenService } from '../../src/services/token.service';
import { cacheService } from '../../src/services/cache.service';
import { User, UserStatus, UserRole } from '../../src/models/user.entity';
import {
  ConflictError,
  AuthenticationError,
  ValidationError,
} from '../../src/errors/AppError';

// Mock all dependencies
jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/services/token.service');
jest.mock('../../src/services/cache.service');
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockTokenService = tokenService as jest.Mocked<typeof tokenService>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({ id: 'uuid-1', email: 'test@test.com' } as User);

      const result = await authService.register({
        name: 'Test User',
        email: 'test@test.com',
        password: 'SecurePass123!',
      });

      expect(result.message).toContain('Registration successful');
      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@test.com');
      expect(mockUserRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictError if email already exists', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: 'existing' } as User);

      await expect(
        authService.register({
          name: 'Test',
          email: 'existing@test.com',
          password: 'Pass123!',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    const createMockUser = (overrides: Partial<User> = {}): User => {
      const user = Object.create(User.prototype);
      return Object.assign(user, {
        id: 'uuid-1',
        email: 'test@test.com',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
        emailVerifiedAt: new Date(),
        comparePassword: jest.fn().mockResolvedValue(true),
        isLocked: jest.fn().mockReturnValue(false),
        isEmailVerified: jest.fn().mockReturnValue(true),
        isActive: jest.fn().mockReturnValue(true),
        resetFailedAttempts: jest.fn(),
        incrementFailedAttempts: jest.fn(),
        toSafeObject: jest.fn().mockReturnValue({ id: 'uuid-1', email: 'test@test.com' }),
        ...overrides,
      });
    };

    it('should login successfully with valid credentials', async () => {
      const mockUser = createMockUser();
      mockUserRepo.findByEmailWithPassword.mockResolvedValue(mockUser);
      mockUserRepo.save.mockResolvedValue(mockUser);
      mockTokenService.generateTokenPair.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
      mockTokenService.hashToken.mockReturnValue('hashed-token');

      const result = await authService.login(
        { email: 'test@test.com', password: 'Pass123!' },
        '127.0.0.1'
      );

      expect(result.tokens.accessToken).toBe('access-token');
      expect(mockUser.resetFailedAttempts).toHaveBeenCalled();
    });

    it('should throw AuthenticationError for invalid credentials', async () => {
      mockUserRepo.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'wrong@test.com', password: 'Wrong!' }, '127.0.0.1')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for locked account', async () => {
      const mockUser = createMockUser({
        isLocked: jest.fn().mockReturnValue(true),
      });
      mockUserRepo.findByEmailWithPassword.mockResolvedValue(mockUser);

      await expect(
        authService.login({ email: 'test@test.com', password: 'Pass123!' }, '127.0.0.1')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should require 2FA code when enabled', async () => {
      const mockUser = createMockUser({ twoFactorEnabled: true, twoFactorSecret: 'secret' });
      mockUserRepo.findByEmailWithPassword.mockResolvedValue(mockUser);

      await expect(
        authService.login({ email: 'test@test.com', password: 'Pass123!' }, '127.0.0.1')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('logout', () => {
    it('should logout and blacklist tokens', async () => {
      const mockUser = { id: 'uuid-1', refreshTokenHash: 'hash' } as User;
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockUserRepo.save.mockResolvedValue(mockUser);
      mockTokenService.hashToken.mockReturnValue('hashed');
      mockCacheService.blacklistToken.mockResolvedValue();
      mockCacheService.delete.mockResolvedValue();

      await authService.logout('uuid-1', 'refresh-token');

      expect(mockCacheService.blacklistToken).toHaveBeenCalled();
      expect(mockCacheService.delete).toHaveBeenCalledWith('auth:uuid-1');
    });
  });
});
