import { Router, Request, Response } from 'express';
import { AppDataSource } from '@config/database';
import { getRedisClient } from '@config/redis';
import { logger } from '@config/logger';

const router = Router();

type State = 'up' | 'down';

interface Dependencies {
  database: State;
  cache: State;
}

const CHECK_TIMEOUT_MS = 2000;
const CACHE_MS = 2000;

async function probe(name: string, check: () => Promise<unknown>): Promise<State> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
    });
    await Promise.race([Promise.resolve().then(check), timeout]);
    return 'up';
  } catch (error) {
    logger.warn(`Health check: ${name} unreachable`, { error });
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

let cached: { at: number; result: Promise<Dependencies> } | undefined;

// A sonda fica fora do limite de requisições, então o resultado vale por 2 s e a
// consulta em andamento é compartilhada: mil chamadas fazem uma consulta só.
function checkDependencies(): Promise<Dependencies> {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    const result = Promise.all([
      probe('database', () => AppDataSource.query('SELECT 1')),
      probe('cache', () => getRedisClient().ping()),
    ]).then(([database, cache]) => ({ database, cache }));
    cached = { at: now, result };
  }
  return cached.result;
}

export function resetHealthCache(): void {
  cached = undefined;
}

// Público, então diz só o necessário: versão, ambiente e tempo no ar ajudam
// quem procura versão vulnerável e não ajudam quem usa.
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const services = await checkDependencies();
  const up = Object.values(services).filter((state) => state === 'up').length;
  const status = up === 2 ? 'healthy' : up === 1 ? 'degraded' : 'unhealthy';
  const statusCode = up === 2 ? 200 : up === 1 ? 207 : 503;
  res.status(statusCode).json({ status, timestamp: new Date().toISOString(), services });
});

// Pronto é poder atender: sem o banco nenhuma rota responde. Sem o Redis a API
// degrada (a revogação ainda é conferida no banco), então não sai do ar por isso.
router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  const { database } = await checkDependencies();
  const ready = database === 'up';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

export default router;
