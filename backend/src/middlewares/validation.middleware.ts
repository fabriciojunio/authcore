import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '@errors/AppError';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const xss = require('xss') as (input: string) => string;

type RequestTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = schema.parse(req[target]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      req[target] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
        throw new ValidationError('Request validation failed', details);
      }
      throw error;
    }
  };
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  function sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return xss(value.trim());
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val);
      }
      return sanitized;
    }
    return value;
  }

  if (req.body) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req.body = sanitizeValue(req.body);
  }

  next();
}
