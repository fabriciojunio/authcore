import { Request, Response, NextFunction } from 'express';
import { tokenService } from '@services/token.service';
import { cacheService } from '@services/cache.service';
import { userRepository } from '@repositories/user.repository';
import { AuthenticationError, AuthorizationError } from '@errors/AppError';
import { UserRole } from '@models/user.entity';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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

  // O estado de autorização precisa refletir revogações já confirmadas no banco.
  const dbUser = await userRepository.findById(payload.sub);
  if (!dbUser || !dbUser.isActive()) {
    throw new AuthenticationError('User account is not available');
  }
  if ((payload.sessionVersion ?? 0) !== (dbUser.sessionVersion ?? 0)) {
    throw new AuthenticationError('Token has been revoked');
  }

  req.user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
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

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    await authenticate(req, res, () => undefined);
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error;
    delete req.user;
  }

  next();
}
