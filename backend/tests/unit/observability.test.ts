import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { requestContext } from '../../src/middlewares/context.middleware';
import { currentContext } from '../../src/observability/context';
import { countSecurityEvent, httpMetrics, initSecurityEvents, registry } from '../../src/observability/metrics';
import { createMetricsServer } from '../../src/observability/metrics.server';
import { redact } from '../../src/utils/redact';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function metric(name: string, labels: Record<string, string>): Promise<number> {
  const data = await registry.getSingleMetric(name)!.get();
  return (
    data.values.find((v) =>
      Object.entries(labels).every(([key, value]) => (v.labels as Record<string, string>)[key] === value)
    )?.value ?? 0
  );
}

describe('contexto da requisição', () => {
  const app = express();
  app.use(requestContext);
  app.get('/ctx', async (_req, res) => {
    await new Promise((resolve) => setImmediate(resolve));
    res.json(currentContext());
  });

  it('gera o id no servidor, devolve no cabeçalho e mantém depois de um await', async () => {
    const res = await request(app).get('/ctx');
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.body.correlationId).toBe(res.headers['x-request-id']);
  });

  it('não deixa o cliente escolher o id; o dele fica num campo à parte', async () => {
    const res = await request(app).get('/ctx').set('X-Request-ID', 'id-de-outra-pessoa');
    expect(res.body.correlationId).toMatch(UUID);
    expect(res.body.clientRequestId).toBe('id-de-outra-pessoa');
  });

  it.each([['curto', 'abc'], ['longo', 'a'.repeat(65)], ['com espaço e aspas', 'abcdefgh "x"']])(
    'descarta o id do cliente %s', async (_caso, valor) => {
      const res = await request(app).get('/ctx').set('X-Request-ID', valor);
      expect(res.body).not.toHaveProperty('clientRequestId');
    });

  it('requisições simultâneas não trocam de contexto', async () => {
    const respostas = await Promise.all(Array.from({ length: 20 }, () => request(app).get('/ctx')));
    respostas.forEach((r) => expect(r.body.correlationId).toBe(r.headers['x-request-id']));
    expect(new Set(respostas.map((r) => r.body.correlationId)).size).toBe(20);
  });
});

describe('métricas', () => {
  const app = express();
  app.use(httpMetrics);
  const rotas = express.Router();
  rotas.get('/:id', (_req, res) => { res.json({}); });
  rotas.get('/erro/agora', (_req, _res, next) => next(new Error('x')));
  app.use('/api/v1/users', rotas);
  app.use((_e: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).end();
  });

  beforeEach(() => registry.resetMetrics());

  it('usa o modelo da rota, nunca o caminho com o id', async () => {
    await request(app).get('/api/v1/users/123?token=segredo');
    await request(app).get('/api/v1/users/456');
    expect(await metric('authcore_http_requests_total', { route: '/api/v1/users/:id', status: '200' })).toBe(2);
    // O texto inteiro tem métricas do processo (memória, PID) com qualquer número; o que não pode
    // aparecer é o caminho com o id nem a consulta.
    expect(await registry.metrics()).not.toMatch(/users\/123|users\/456|segredo/);
  });

  it('mantém o prefixo quando a resposta sai pelo tratador de erro', async () => {
    await request(app).get('/api/v1/users/erro/agora');
    expect(await metric('authcore_http_requests_total', { route: '/api/v1/users/erro/agora', status: '500' })).toBe(1);
  });

  it('quem varre caminhos não cria série nova', async () => {
    for (let i = 0; i < 30; i++) await request(app).get(`/wp-admin/${i}`);
    expect(await metric('authcore_http_requests_total', { route: 'unmatched', status: '404' })).toBe(30);
    expect(await registry.metrics()).not.toContain('wp-admin');
  });

  it('série de evento existe em zero antes do primeiro evento, senão o alerta perde a primeira vez', async () => {
    initSecurityEvents();
    const texto = await registry.metrics();
    expect(texto).toContain('authcore_security_events_total{event="auth.refresh_reuse",reason="none"} 0');
    expect(texto).toContain('reason="totp_replay"} 0');
    expect(texto).toContain('authcore_audit_write_failures_total 0');
  });

  it('motivo fora da lista vira other, então valor do cliente não vira rótulo', async () => {
    countSecurityEvent('auth.login_failed', 'alguem@exemplo.com');
    countSecurityEvent('auth.login_failed', 'bad_password');
    expect(await metric('authcore_security_events_total', { event: 'auth.login_failed', reason: 'other' })).toBe(1);
    expect(await metric('authcore_security_events_total', { event: 'auth.login_failed', reason: 'bad_password' })).toBe(1);
    expect(await registry.metrics()).not.toContain('alguem@');
  });
});

describe('servidor de métricas', () => {
  let server: http.Server;
  let base: string;
  beforeAll((done) => {
    server = createMetricsServer().listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });
  afterAll((done) => { server.close(done); });

  it('entrega o formato do Prometheus só em GET /metrics', async () => {
    const ok = await request(base).get('/metrics');
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('text/plain');
    expect(ok.text).toContain('authcore_process_cpu_seconds_total');
    expect((await request(base).get('/')).status).toBe(404);
    expect((await request(base).post('/metrics')).status).toBe(404);
  });
});

describe('redação de log', () => {
  it('apaga campo sensível em qualquer profundidade e grafia', () => {
    const limpo = JSON.stringify(redact({
      userId: 'u-1', passkeyId: 'p-1',
      body: { Password: 'abc123', items: [{ refreshToken: 'tok' }], contato: { eMail: 'a@b.com', 'E-Mail': 'c@d.com' } },
      headers: { Authorization: 'Bearer xyz', 'set-cookie': 's=1', 'X-Api-Key': 'k' },
    }));
    expect(limpo).not.toMatch(/abc123|"tok"|@|xyz|s=1|"k"/);
    expect(limpo).toContain('u-1');
    expect(limpo).toContain('p-1');
  });

  it('de um erro de banco só sobram nome, mensagem e pilha', () => {
    const erro = Object.assign(new Error('insert falhou'), { parameters: ['vitima@exemplo.com', '203.0.113.7'] });
    const limpo = redact({ error: erro }) as { error: Record<string, unknown> };
    expect(Object.keys(limpo.error)).toEqual(['name', 'message', 'stack']);
    expect(JSON.stringify(limpo)).not.toMatch(/vitima|203\.0/);
  });

  it('corta objeto fundo ou circular em vez de estourar a pilha', () => {
    const circular: Record<string, unknown> = {};
    circular['eu'] = circular;
    expect(JSON.stringify(redact(circular))).toContain('[TRUNCATED]');
  });
});
