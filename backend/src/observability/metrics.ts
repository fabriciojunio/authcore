import { NextFunction, Request, Response } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { config } from '@config/app.config';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'authcore_' });

const requests = new Counter({
  name: 'authcore_http_requests_total',
  help: 'Requisições por método, rota e status',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

const latency = new Histogram({
  name: 'authcore_http_request_duration_seconds',
  help: 'Tempo de resposta por método e rota',
  labelNames: ['method', 'route'] as const,
  // O bcrypt de custo 12 leva perto de 200 ms: os baldes em volta disso é que
  // dizem se o login está no normal.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.5, 3, 5],
  registers: [registry],
});

const securityEvents = new Counter({
  name: 'authcore_security_events_total',
  help: 'Eventos de segurança: autenticação, recusa e abuso',
  labelNames: ['event', 'reason'] as const,
  registers: [registry],
});

const auditFailures = new Counter({
  name: 'authcore_audit_write_failures_total',
  help: 'Eventos que a trilha de auditoria não conseguiu gravar',
  registers: [registry],
});

// Todo rótulo vem de lista fechada. Rótulo com valor do cliente (caminho cru,
// e-mail, IP) deixaria quem ataca criar série sem limite, e poria dado pessoal
// na métrica.
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const MOUNTS = [
  ...['auth', 'users', 'products', 'audit'].map((name) => `${config.app.apiPrefix}/${name}`),
  '/health',
];

export function routeLabel(req: Request): string {
  const pattern: unknown = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof pattern !== 'string') return 'unmatched';
  // req.baseUrl já foi desfeito quando a resposta sai pelo tratador de erro; o
  // prefixo sai do caminho original, conferido contra os pontos de montagem.
  const path = req.originalUrl.split('?', 1)[0] ?? '';
  const mount = MOUNTS.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!mount) return 'unmatched';
  return pattern === '/' ? mount : `${mount}${pattern}`;
}

export function httpMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const method = METHODS.has(req.method) ? req.method : 'OTHER';
    const route = routeLabel(req);
    requests.inc({ method, route, status: String(res.statusCode) });
    latency.observe({ method, route }, Number(process.hrtime.bigint() - start) / 1e9);
  });
  next();
}

const LOGIN_FAILURES = [
  'unknown_user', 'locked', 'bad_password', 'unverified', 'inactive', 'bad_totp', 'totp_replay', 'other',
];
const EVENTS = {
  'auth.register': ['none'],
  'auth.register_existing': ['none'],
  'auth.login': ['none'],
  'auth.login_failed': LOGIN_FAILURES,
  'auth.logout': ['none'],
  'auth.refresh_reuse': ['none'],
  'user.password_change': ['none'],
  'user.delete': ['none'],
  'passkey.register': ['none'],
  'passkey.remove': ['none'],
  csrf_rejected: ['none'],
  cors_rejected: ['none'],
  rate_limited: ['global', 'auth'],
  access_denied: ['none'],
} as const satisfies Record<string, readonly string[]>;

export type SecurityEvent = keyof typeof EVENTS;

// Toda série nasce em zero. Sem isto ela só existe a partir do primeiro evento, já
// valendo 1, e `increase()` sobre uma série que acabou de aparecer dá zero: o alerta
// de refresh reutilizado perderia a primeira ocorrência, que é a que importa.
export function initSecurityEvents(): void {
  for (const [event, reasons] of Object.entries(EVENTS)) {
    for (const reason of reasons) securityEvents.inc({ event, reason }, 0);
  }
}
initSecurityEvents();

export function countSecurityEvent(event: SecurityEvent, reason = 'none'): void {
  const known: readonly string[] = EVENTS[event];
  securityEvents.inc({ event, reason: known.includes(reason) ? reason : 'other' });
}

export function countAuditFailure(): void {
  auditFailures.inc();
}
