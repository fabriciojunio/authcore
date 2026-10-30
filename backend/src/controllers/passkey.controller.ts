import { Request, Response } from 'express';
import { passkeyService } from '@services/passkey.service';
import { HttpStatus } from '@errors/AppError';
import type { PasskeyAuthenticationDto, PasskeyRegistrationDto } from '@validators/passkey.validator';

export class PasskeyController {
  async registrationOptions(req: Request, res: Response): Promise<void> {
    const options = await passkeyService.registrationOptions(req.user!.id);
    res.status(HttpStatus.OK).json({ success: true, data: options });
  }

  async verifyRegistration(req: Request, res: Response): Promise<void> {
    const { name, response } = req.body as PasskeyRegistrationDto;
    const passkey = await passkeyService.verifyRegistration(req.user!.id, response, name);
    res.status(HttpStatus.CREATED).json({ success: true, data: passkey });
  }

  async authenticationOptions(_req: Request, res: Response): Promise<void> {
    const result = await passkeyService.authenticationOptions();
    res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  async verifyAuthentication(req: Request, res: Response): Promise<void> {
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const { flowId, response } = req.body as PasskeyAuthenticationDto;
    const result = await passkeyService.verifyAuthentication(flowId, response, ipAddress);

    // Mesmo cookie do login com senha: a passkey só troca a forma de provar quem é.
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

  async list(req: Request, res: Response): Promise<void> {
    const passkeys = await passkeyService.list(req.user!.id);
    res.status(HttpStatus.OK).json({ success: true, data: passkeys });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await passkeyService.remove(req.user!.id, (req.params as { id: string }).id);
    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const passkeyController = new PasskeyController();
