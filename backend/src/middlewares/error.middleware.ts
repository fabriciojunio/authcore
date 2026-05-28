import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { QueryFailedError } from 'typeorm';
import { AppError, HttpStatus, isAppError } from '@errors/AppError';
import { logger } from '@config/logger';
import { config } from '@config/app.config';
import { v4 as uuidv4 } from 'uuid';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    timestamp: string;
    details?: unknown;
    stack?: string;
  };
}

function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

function handleDatabaseError(error: QueryFailedError): AppError {
  const message = (error as unknown as { detail?: string }).detail ?? '';
  
  if (message.includes('unique constraint') || message.includes('duplicate key')) {
    return new AppError('Resource already exists', HttpStatus.CONFLICT, 'CONFLICT');
  }
  
  if (message.includes('foreign key constraint')) {
    return new AppError('Related resource not found', HttpStatus.BAD_REQUEST, 'INVALID_REFERENCE');
  }
  
  return new AppError('Database error occurred', HttpStatus.INTERNAL_SERVER_ERROR, 'DATABASE_ERROR', false);
}

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = uuidv4();
  const isDevelopment = config.node.env === 'development';

  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError(
      'Validation failed',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VALIDATION_ERROR',
      true,
      formatZodError(error)
    );
  } else if (error instanceof QueryFailedError) {
    appError = handleDatabaseError(error);
  } else if (error.name === 'MulterError') {
    appError = new AppError(error.message, HttpStatus.BAD_REQUEST, 'FILE_UPLOAD_ERROR');
  } else {
    appError = new AppError(
      'An unexpected error occurred',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      false
    );
  }

  // Log errors
  const logData = {
    requestId,
    method: req.method,
    url: req.url,
    statusCode: appError.statusCode,
    errorCode: appError.code,
    isOperational: appError.isOperational,
    userId: req.user?.id,
    ip: req.ip,
  };

  if (!appError.isOperational || appError.statusCode >= 500) {
    logger.error(appError.message, { ...logData, stack: error.stack });
  } else {
    logger.warn(appError.message, logData);
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(appError.details ? { details: appError.details } : {}),
      // NEVER expose stack trace in production
      ...(isDevelopment && appError.statusCode >= 500 ? { stack: error.stack } : {}),
    },
  };

  res.status(appError.statusCode).json(response);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route ${req.method} ${req.url} not found`, HttpStatus.NOT_FOUND, 'ROUTE_NOT_FOUND'));
}
