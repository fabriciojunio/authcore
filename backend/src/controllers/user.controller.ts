import { Request, Response } from 'express';
import { userService } from '@services/user.service';
import { HttpStatus } from '@errors/AppError';
import { ValidationError } from '@errors/AppError';

export class UserController {
  async getProfile(req: Request, res: Response): Promise<void> {
    const user = await userService.getProfile(req.user!.id);
    res.status(HttpStatus.OK).json({
      success: true,
      data: { user: user.toSafeObject() },
    });
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const user = await userService.updateProfile(req.user!.id, req.body);
    res.status(HttpStatus.OK).json({
      success: true,
      data: { user: user.toSafeObject() },
    });
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    await userService.changePassword(req.user!.id, req.body);
    res.status(HttpStatus.OK).json({
      success: true,
      data: { message: 'Password changed successfully' },
    });
  }

  async getAllUsers(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = Math.min(parseInt(req.query['limit'] as string) || 20, 100);
    const sortBy = (req.query['sortBy'] as string) || 'createdAt';
    const sortOrder = ((req.query['sortOrder'] as string) || 'DESC').toUpperCase() as 'ASC' | 'DESC';

    if (page < 1) throw new ValidationError('Page must be at least 1');
    if (limit < 1) throw new ValidationError('Limit must be at least 1');

    const result = await userService.getAllUsers(
      { page, limit, sortBy, sortOrder },
      req.user!.role
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result.data.map((u) => u.toSafeObject()),
      meta: result.meta,
    });
  }

  async getUserById(req: Request, res: Response): Promise<void> {
    const user = await userService.getUserById(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: { user: user.toSafeObject() },
    });
  }

  async deleteAccount(req: Request, res: Response): Promise<void> {
    await userService.deleteAccount(req.user!.id);
    res.status(HttpStatus.OK).json({
      success: true,
      data: { message: 'Account deleted successfully' },
    });
  }
}

export const userController = new UserController();
