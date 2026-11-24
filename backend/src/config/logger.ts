import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { currentContext, currentTraceId } from '@observability/context';
import { redact } from '@utils/redact';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const LOG_DIR = process.env['LOG_DIR'] ?? './logs';
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
// Em contêiner o log vai para o stdout, que é de onde a plataforma coleta: em
// arquivo ele some junto com a tarefa. O arquivo continua para quem roda sem
// coletor de log.
const LOG_TO_FILE = process.env['LOG_TO_FILE'] === 'true';
// Durante os testes o logger fica mudo: os transportes de arquivo giram log
// dentro do repositório e mantêm o processo vivo depois da última asserção, o
// que obrigava o Jest a rodar com --forceExit e escondia qualquer vazamento de
// verdade. Nenhum teste depende da saída de log.
const IS_TEST = process.env['NODE_ENV'] === 'test';

// Liga a linha à requisição e ao trace, e apaga o que é sensível em qualquer
// profundidade. Os símbolos internos do winston (nível e mensagem) ficam.
export const enrichAndRedact = winston.format((info) => {
  const request = currentContext();
  const traceId = currentTraceId();
  if (request) Object.assign(info, request);
  if (traceId) info['traceId'] = traceId;

  for (const [key, value] of Object.entries(info)) {
    if (key === 'level' || key === 'message') continue;
    info[key] = (redact({ [key]: value }) as Record<string, unknown>)[key];
  }
  return info;
});

const structured = combine(timestamp(), errors({ stack: true }), enrichAndRedact(), json());

function rotatingFile(name: string, maxFiles: string, level?: string): DailyRotateFile {
  return new DailyRotateFile({
    filename: path.join(LOG_DIR, `${name}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    maxFiles,
    maxSize: '20m',
    zippedArchive: true,
    format: structured,
    ...(level ? { level } : {}),
  });
}

const consoleTransport = new winston.transports.Console({
  format: IS_PRODUCTION
    ? structured
    : combine(
        enrichAndRedact(),
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${String(timestamp)} [${String(level)}]: ${String(message)}${metaStr}`;
        })
      ),
});

const writeFiles = LOG_TO_FILE && !IS_TEST;

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  silent: IS_TEST,
  transports: [
    consoleTransport,
    ...(writeFiles ? [rotatingFile('error', '30d', 'error'), rotatingFile('combined', '14d')] : []),
  ],
  // Exceção não tratada: quem encerra o processo é o server.ts.
  ...(writeFiles
    ? {
        exceptionHandlers: [rotatingFile('exceptions', '30d')],
        rejectionHandlers: [rotatingFile('rejections', '30d')],
      }
    : {}),
});

// Override console methods in production to prevent data leaks
if (IS_PRODUCTION) {
  const noop = (): void => {};
  /* eslint-disable no-console */
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  console.trace = noop;
  // Keep console.error but redirect to logger
  console.error = (...args: unknown[]): void => {
    logger.error(args.map(String).join(' '));
  };
  /* eslint-enable no-console */
}
