import http from 'http';
import { registry } from './metrics';

/**
 * Métricas numa porta própria, fora do Express e fora do Nginx: a borda só
 * conhece a porta da API, então ninguém de fora alcança este servidor. A
 * contagem de falha de login por motivo é informação para quem ataca.
 */
export function createMetricsServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    registry
      .metrics()
      .then((body) => res.writeHead(200, { 'Content-Type': registry.contentType }).end(body))
      .catch(() => res.writeHead(500).end());
  });
}
