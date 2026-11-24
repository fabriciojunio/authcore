// Fumaça da API compilada em modo produção: o que ela de fato emite em log,
// métrica e trace. Os testes de unidade não pegam isto: a instrumentação troca
// módulos no require, e o Jest tem o registro de módulos dele.
//
//   npm run build --workspace backend && node backend/tests/smoke/telemetria.cjs
//
// Usa o Postgres das variáveis DB_* com as migrações aplicadas. O coletor OTLP e
// o Redis são dublês locais.
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const API = 13001;
const METRICS = 19464;
const OTLP = 14318;
const REDIS = 16379;

const spans = [];
const collector = http
  .createServer((req, res) => {
    const parts = [];
    req.on('data', (chunk) => parts.push(chunk));
    req.on('end', () => {
      for (const resource of JSON.parse(Buffer.concat(parts)).resourceSpans) {
        for (const scope of resource.scopeSpans) spans.push(...scope.spans);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
  })
  .listen(OTLP, '127.0.0.1');

const REPLIES = { PING: '+PONG\r\n', GET: '$-1\r\n', GETDEL: '$-1\r\n', EXISTS: ':0\r\n', DEL: ':0\r\n' };
const redis = net
  .createServer((socket) => {
    socket.on('error', () => undefined);
    socket.on('data', (data) => {
      for (const message of data.toString().split(/(?=\*\d+\r\n)/)) {
        const command = (message.split('\r\n')[2] ?? '').toUpperCase();
        socket.write(REPLIES[command] ?? '+OK\r\n');
      }
    });
  })
  .listen(REDIS, '127.0.0.1');

const api = spawn(process.execPath, ['dist/server.js'], {
  cwd: path.resolve(__dirname, '../..'),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_NAME: 'AuthCore',
    PORT: String(API),
    METRICS_PORT: String(METRICS),
    JWT_ACCESS_SECRET: 'a'.repeat(70),
    JWT_REFRESH_SECRET: 'b'.repeat(70),
    ENCRYPTION_KEY: 'c'.repeat(32),
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: String(REDIS),
    REDIS_TLS: 'false',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'x',
    SMTP_PASSWORD: 'x',
    EMAIL_FROM: 'fumaca@example.com',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${OTLP}`,
  },
});
let output = '';
api.stdout.on('data', (data) => (output += data));
api.stderr.on('data', (data) => (output += data));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function call(port, url, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: url, method, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      }
    );
    req.on('error', reject);
    req.end(body && JSON.stringify(body));
  });
}

async function until(condition, what) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await condition().catch(() => false)) return;
    await sleep(500);
  }
  throw new Error(`esperou demais por: ${what}\n${output.slice(-2000)}`);
}

let failures = 0;
function check(name, passed) {
  if (!passed) failures++;
  console.log(passed ? 'ok   ' : 'FALHA', name);
}

async function main() {
  await until(async () => (await call(API, '/health/ready')).status === 200, 'API pronta');

  const login = await call(API, '/api/v1/auth/login?token=segredoNaQuery', {
    method: 'POST',
    body: { email: 'vitima@exemplo.com', password: 'SenhaSecreta123!' },
    headers: { 'X-Request-ID': 'id-do-cliente-1' },
  });
  const id = login.headers['x-request-id'];
  check('login inexistente responde 401', login.status === 401);
  check('o id do corpo é o do cabeçalho', JSON.parse(login.text).error.requestId === id);

  await call(API, '/api/v1/auth/refresh', {
    method: 'POST',
    body: {},
    headers: { Cookie: 'a=b', Origin: 'https://atacante.example' },
  });
  check('/metrics não existe na porta da API', (await call(API, '/metrics')).status === 404);

  const metrics = (await call(METRICS, '/metrics')).text;
  check('falha de login contada com o motivo', metrics.includes('event="auth.login_failed",reason="unknown_user"} 1'));
  check('CSRF recusado contado', metrics.includes('event="csrf_rejected",reason="none"} 1'));
  check('rota pelo modelo', metrics.includes('method="POST",route="/api/v1/auth/login",status="401"} 1'));

  await until(async () => spans.some((span) => /^pg/.test(span.name)), 'span do Postgres no coletor');

  const lines = output.split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  });
  check('toda linha do stdout é JSON', lines.every(Boolean));
  const ours = lines.filter((line) => line?.correlationId === id);
  check('as linhas da requisição levam o correlationId', ours.length >= 2);
  check('o id do cliente fica em campo à parte', ours.some((line) => line.clientRequestId === 'id-do-cliente-1'));
  const traceId = ours.find((line) => line.traceId)?.traceId;
  check('o traceId do log existe no coletor', spans.some((span) => span.traceId === traceId));
  check('a sonda de saúde não vira span', !JSON.stringify(spans).includes('/health'));

  for (const secret of ['vitima@', 'SenhaSecreta', 'segredoNaQuery']) {
    check(`log sem "${secret}"`, !output.includes(secret));
    check(`trace sem "${secret}"`, !JSON.stringify(spans).includes(secret));
  }
}

main()
  .catch((error) => {
    failures++;
    console.error(error.message);
  })
  .finally(() => {
    api.kill();
    collector.close();
    redis.close();
    setTimeout(() => process.exit(failures ? 1 : 0), 500);
  });
