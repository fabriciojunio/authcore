import { AsyncLocalStorage } from 'async_hooks';
import { trace } from '@opentelemetry/api';

export interface RequestContext {
  correlationId: string;
  // O X-Request-ID que o cliente mandou, quando tem formato válido. Nunca vira o
  // id da requisição: quem ataca escolheria o mesmo id de outra pessoa para
  // misturar os rastros no log.
  clientRequestId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
