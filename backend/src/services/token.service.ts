import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '@config/app.config';
import { AuthenticationError } from '@errors/AppError';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class TokenService {
  generateTokenPair(payload: Omit<TokenPayload, 'type' | 'iat' | 'exp'>): TokenPair {
    const accessPayload: TokenPayload = { ...payload, type: 'access' };
    const refreshPayload: TokenPayload = { ...payload, type: 'refresh' };

    const accessToken = jwt.sign(
      accessPayload as object,
      config.security.jwt.accessSecret,
      {
        expiresIn: config.security.jwt.accessExpiration as unknown as number,
        algorithm: 'HS256',
        issuer: config.app.name,
        audience: 'api',
      }
    );

    const refreshToken = jwt.sign(
      refreshPayload as object,
      config.security.jwt.refreshSecret,
      {
        expiresIn: config.security.jwt.refreshExpiration as unknown as number,
        algorithm: 'HS256',
        issuer: config.app.name,
        audience: 'api',
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.security.jwt.accessSecret, {
        algorithms: ['HS256'],
        issuer: config.app.name,
        audience: 'api',
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }

  verifyRefreshToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.security.jwt.refreshSecret, {
        algorithms: ['HS256'],
        issuer: config.app.name,
        audience: 'api',
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Refresh token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid refresh token');
      }
      throw error;
    }
  }

  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const tokenService = new TokenService();
