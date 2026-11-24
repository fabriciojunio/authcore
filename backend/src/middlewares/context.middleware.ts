import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { runWithContext } from '@observability/context';

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Primeiro middleware da cadeia: tudo que vier depois, inclusive a recusa por
 * limite de requisições, sai no log com o mesmo correlationId que o cliente
 * recebe no X-Request-ID e no corpo do erro.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const correlationId = randomUUID();
  const sent = req.headers['x-request-id'];
  const clientRequestId = typeof sent === 'string' && CLIENT_ID.test(sent) ? sent : undefined;

  res.setHeader('X-Request-ID', correlationId);
  runWithContext({ correlationId, clientRequestId }, next);
}
