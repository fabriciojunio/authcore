import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '@errors/AppError';

type RequestTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed; // Replace with sanitized/transformed data
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
  const xss = require('xss');
  
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
    req.body = sanitizeValue(req.body);
  }

  next();
}
