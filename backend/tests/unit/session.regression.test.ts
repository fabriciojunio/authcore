import { Request, Response } from 'express';
import { User } from '../../src/models/user.entity';
import { tokenService } from '../../src/services/token.service';
import { sanitizeBody } from '../../src/middlewares/validation.middleware';
import { registerSchema, refreshTokenSchema } from '../../src/validators/auth.validator';

describe('Regressões de credenciais e sessão', () => {
  it('emite tokens diferentes mesmo no mesmo segundo', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T00:00:00Z'));
    try {
      const payload = { sub: 'user', email: 'audit@example.test', role: 'user' };
      const first = tokenService.generateTokenPair(payload);
      const second = tokenService.generateTokenPair(payload);
      expect(first.refreshToken).not.toBe(second.refreshToken);
      expect(first.accessToken).not.toBe(second.accessToken);
    } finally {
      jest.useRealTimers();
    }
  });

  it('não publica tokens de recuperação nem campos internos', () => {
    const user = Object.assign(new User(), {
      id: 'user', passwordResetToken: 'segredo-recuperacao', passwordResetExpires: new Date(),
      failedLoginAttempts: 4, lockedUntil: new Date(), sessionVersion: 3,
    });
    const safe = user.toSafeObject();
    for (const field of ['passwordResetToken', 'passwordResetExpires', 'failedLoginAttempts', 'lockedUntil', 'sessionVersion']) {
      expect(safe).not.toHaveProperty(field);
    }
  });

  it('preserva todos os bytes de senha na sanitização', () => {
    const secret = '  Password1!<script>  ';
    const req = { body: { password: secret, confirmPassword: secret, currentPassword: secret,
      newPassword: secret, confirmNewPassword: secret } } as Request;
    sanitizeBody(req, {} as Response, jest.fn());
    expect(Object.values(req.body as Record<string, unknown>)).toEqual(Array(5).fill(secret));
  });

  it('aceita corpo vazio quando a renovação chega em cookie', () => {
    expect(refreshTokenSchema.safeParse({}).success).toBe(true);
  });

  it('rejeita senhas que seriam truncadas pelo bcrypt', () => {
    const password = 'Ab1!' + 'é'.repeat(35);
    expect(registerSchema.safeParse({ name: 'Audit User', email: 'audit@example.test',
      password, confirmPassword: password }).success).toBe(false);
  });
});
