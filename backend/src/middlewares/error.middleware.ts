import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { QueryFailedError } from 'typeorm';
import { AppError, HttpStatus, isAppError } from '@errors/AppError';
import { logger } from '@config/logger';
import { config } from '@config/app.config';
import { randomUUID } from 'crypto';
import { currentContext } from '@observability/context';
import { countSecurityEvent } from '@observability/metrics';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleDatabaseError(error: QueryFailedError<any>): AppError {
  const message = (error as unknown as { detail?: string }).detail ?? '';
  
  if (message.includes('unique constraint') || message.includes('duplicate key')) {
    return new AppError('Resource already exists', HttpStatus.CONFLICT, 'CONFLICT');
  }
  
  if (message.includes('foreign key constraint')) {
    return new AppError('Related resource not found', HttpStatus.BAD_REQUEST, 'INVALID_REFERENCE');
  }
  
  return new AppError('Database error occurred', HttpStatus.INTERNAL_SERVER_ERROR, 'DATABASE_ERROR', false);
}

// O express.json levanta erro com status 4xx que não é AppError. Sem isto ele virava 500, e
// o 5xx deixava de significar defeito do servidor para quem monitora (AUTHCORE-004).
function handleBodyError(error: Error): AppError | undefined {
  switch ((error as Error & { type?: string }).type) {
    case 'entity.too.large':
      return new AppError('Request body too large', HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE');
    case 'entity.parse.failed':
      return new AppError('Malformed request body', HttpStatus.BAD_REQUEST, 'MALFORMED_BODY');
    case 'encoding.unsupported':
    case 'charset.unsupported':
    case 'request.aborted':
    case 'request.size.invalid':
    case 'parameters.too.many':
      return new AppError('Invalid request body', HttpStatus.BAD_REQUEST, 'INVALID_BODY');
    default:
      return undefined;
  }
}

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = currentContext()?.correlationId ?? randomUUID();
  const isDevelopment = config.node.env === 'development';

  let appError: AppError;
  const bodyError = handleBodyError(error);

  if (isAppError(error)) {
    appError = error;
  } else if (bodyError) {
    appError = bodyError;
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

  if (appError.code === 'AUTHORIZATION_ERROR') countSecurityEvent('access_denied');

  // Log errors
  const logData = {
    method: req.method,
    path: req.url.split('?', 1)[0],
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
  next(new AppError(`Route ${req.method} ${req.url.split('?', 1)[0]} not found`, HttpStatus.NOT_FOUND, 'ROUTE_NOT_FOUND'));
}
