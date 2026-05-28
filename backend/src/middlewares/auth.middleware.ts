import { Request, Response, NextFunction } from 'express';
import { tokenService } from '@services/token.service';
import { cacheService } from '@services/cache.service';
import { userRepository } from '@repositories/user.repository';
import { AuthenticationError, AuthorizationError } from '@errors/AppError';
import { UserRole } from '@models/user.entity';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('Authorization header missing or malformed');
  }

  const token = authHeader.slice(7);

  // Check if token is blacklisted
  const isBlacklisted = await cacheService.isTokenBlacklisted(
    tokenService.hashToken(token)
  );
  if (isBlacklisted) {
    throw new AuthenticationError('Token has been revoked');
  }

  const payload = tokenService.verifyAccessToken(token);

  // Verify user still exists and is active
  const cacheKey = `auth:${payload.sub}`;
  let user = await cacheService.get<{ id: string; email: string; role: UserRole }>(cacheKey);

  if (!user) {
    const dbUser = await userRepository.findById(payload.sub);
    if (!dbUser || !dbUser.isActive()) {
      throw new AuthenticationError('User account is not available');
    }
    user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    await cacheService.set(cacheKey, user, 60); // Cache for 1 minute
  }

  req.user = user;
  next();
}

export function authorize(...roles: UserRole[]) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    if (!_req.user) {
      throw new AuthenticationError();
    }

    if (!roles.includes(_req.user.role)) {
      throw new AuthorizationError(
        `Access restricted. Required roles: ${roles.join(', ')}`
      );
    }

    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.slice(7);
    const payload = tokenService.verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role as UserRole };
  } catch {
    // Ignore errors for optional auth
  }

  next();
}
