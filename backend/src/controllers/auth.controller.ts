import { Request, Response } from 'express';
import { authService } from '@services/auth.service';
import { HttpStatus } from '@errors/AppError';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body);
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: result,
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const result = await authService.login(req.body, ipAddress);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth/refresh',
    });

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    // Prefer cookie over body for security
    const refreshToken = req.cookies?.refreshToken ?? req.body?.refreshToken;
    const tokens = await authService.refresh(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      },
    });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.refreshToken ?? req.body?.refreshToken ?? '';
    await authService.logout(req.user!.id, refreshToken);

    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

    res.status(HttpStatus.OK).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }

  async me(req: Request, res: Response): Promise<void> {
    res.status(HttpStatus.OK).json({
      success: true,
      data: { user: req.user },
    });
  }
}

export const authController = new AuthController();
