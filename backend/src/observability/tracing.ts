import { IncomingMessage } from 'http';
import { Span, context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';

// O redactedQueryParams da instrumentação só vale para requisição de saída; a de
// entrada ia para o coletor com a consulta inteira (token, código) e o IP.
const PRIVATE_ATTRIBUTES = ['url.query', 'client.address', 'network.peer.address'];

export function redactIncoming(span: Pick<Span, 'setAttribute'>, request: object): void {
  if (!(request instanceof IncomingMessage)) return;
  for (const name of PRIVATE_ATTRIBUTES) span.setAttribute(name, '[REDACTED]');
}

/**
 * Trace só existe quando há um coletor configurado. Precisa rodar antes de
 * carregar Express, pg e redis, porque a instrumentação troca os módulos na
 * hora do require; por isso é a primeira importação do server.ts.
 *
 * O que vai no span é de propósito pouco: texto do SQL com marcador ($1), nunca
 * o valor; comando do Redis sem chave nem valor; nada da consulta da URL nem do
 * IP de quem chamou.
 */
export function startTracing(): TracerProvider | undefined {
  if (!process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) return undefined;

  const provider = new TracerProvider({
    resource: resourceFromAttributes({
      'service.name': 'authcore-api',
      'service.version': process.env['APP_VERSION'] ?? '1.0.0',
      'deployment.environment.name': process.env['NODE_ENV'] ?? 'development',
    }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
  });

  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        requestHook: redactIncoming,
        ignoreIncomingRequestHook: (req): boolean => /^\/(health|metrics)/.test(req.url ?? ''),
      }),
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
      new PgInstrumentation({ enhancedDatabaseReporting: false, requireParentSpan: true }),
      new RedisInstrumentation({
        dbStatementSerializer: (command): string => command,
        requireParentSpan: true,
      }),
    ],
  });

  return provider;
}

export const tracerProvider = startTracing();
