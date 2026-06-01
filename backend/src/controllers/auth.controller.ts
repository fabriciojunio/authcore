import { Request, Response } from 'express';
import { authService } from '@services/auth.service';
import { HttpStatus } from '@errors/AppError';
import type { RegisterDto, LoginDto } from '@validators/auth.validator';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body as RegisterDto);
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: result,
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const result = await authService.login(req.body as LoginDto, ipAddress);

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
    const cookies = req.cookies as { refreshToken?: string };
    const body = req.body as { refreshToken?: string };
    const refreshToken = cookies.refreshToken ?? body.refreshToken ?? '';
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
    const cookies = req.cookies as { refreshToken?: string };
    const body = req.body as { refreshToken?: string };
    const refreshToken = cookies.refreshToken ?? body.refreshToken ?? '';
    await authService.logout(req.user!.id, refreshToken);

    res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

    res.status(HttpStatus.OK).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }

  me(req: Request, res: Response): void {
    res.status(HttpStatus.OK).json({
      success: true,
      data: { user: req.user },
    });
  }
}

export const authController = new AuthController();
