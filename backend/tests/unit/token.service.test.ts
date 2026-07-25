import jwt from 'jsonwebtoken';
import { TokenService } from '../../src/services/token.service';
import { config } from '../../src/config/app.config';
import { AuthenticationError } from '../../src/errors/AppError';

describe('TokenService (segurança de JWT)', () => {
  const service = new TokenService();
  const payload = { sub: 'user-1', email: 'user@test.com', role: 'user' };

  it('should sign access tokens with HS256 and the access type claim', () => {
    const { accessToken } = service.generateTokenPair(payload);
    const decoded = jwt.decode(accessToken, { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    expect((decoded?.payload as { type: string }).type).toBe('access');
  });

  it('should verify a legitimately issued access token', () => {
    const { accessToken } = service.generateTokenPair(payload);
    const verified = service.verifyAccessToken(accessToken);
    expect(verified.sub).toBe('user-1');
    expect(verified.type).toBe('access');
  });

  it('should reject tokens signed with alg:none', () => {
    const forged = jwt.sign({ ...payload, type: 'access' }, '', {
      algorithm: 'none',
      issuer: config.app.name,
      audience: 'api',
    });
    expect(() => service.verifyAccessToken(forged)).toThrow(AuthenticationError);
  });

  it('should reject access tokens signed with the wrong secret', () => {
    const forged = jwt.sign({ ...payload, type: 'access' }, 'attacker-controlled-secret', {
      algorithm: 'HS256',
      issuer: config.app.name,
      audience: 'api',
    });
    expect(() => service.verifyAccessToken(forged)).toThrow(AuthenticationError);
  });

  it('should reject a refresh token presented as an access token (type confusion)', () => {
    const { refreshToken } = service.generateTokenPair(payload);
    expect(() => service.verifyAccessToken(refreshToken)).toThrow(AuthenticationError);
  });

  it('should reject an access token presented as a refresh token (type confusion)', () => {
    const { accessToken } = service.generateTokenPair(payload);
    expect(() => service.verifyRefreshToken(accessToken)).toThrow(AuthenticationError);
  });

  it('should reject expired access tokens', () => {
    const expired = jwt.sign({ ...payload, type: 'access' }, config.security.jwt.accessSecret, {
      algorithm: 'HS256',
      issuer: config.app.name,
      audience: 'api',
      expiresIn: '-10s',
    });
    expect(() => service.verifyAccessToken(expired)).toThrow(AuthenticationError);
  });

  it('should reject tokens with an unexpected issuer', () => {
    const forged = jwt.sign({ ...payload, type: 'access' }, config.security.jwt.accessSecret, {
      algorithm: 'HS256',
      issuer: 'evil-issuer',
      audience: 'api',
    });
    expect(() => service.verifyAccessToken(forged)).toThrow(AuthenticationError);
  });

  it('should reject tokens with an unexpected audience', () => {
    const forged = jwt.sign({ ...payload, type: 'access' }, config.security.jwt.accessSecret, {
      algorithm: 'HS256',
      issuer: config.app.name,
      audience: 'other-api',
    });
    expect(() => service.verifyAccessToken(forged)).toThrow(AuthenticationError);
  });

  it('should hash tokens deterministically with SHA-256 (64 hex chars)', () => {
    const hash = service.hashToken('some-refresh-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashToken('some-refresh-token')).toBe(hash);
    expect(service.hashToken('other-token')).not.toBe(hash);
  });

  it('should generate secure random values of the requested byte length', () => {
    const random = service.generateSecureRandom(16);
    expect(random).toMatch(/^[a-f0-9]{32}$/);
    expect(service.generateSecureRandom(16)).not.toBe(random);
  });
});
