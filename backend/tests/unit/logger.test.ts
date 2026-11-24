import { runWithContext } from '../../src/observability/context';
import { enrichAndRedact } from '../../src/config/logger';

const LEVEL = Symbol.for('level');

describe('formato do log', () => {
  const formatar = (info: Record<string | symbol, unknown>) =>
    enrichAndRedact().transform(info as never) as unknown as Record<string | symbol, unknown>;

  it('põe o correlationId da requisição em toda linha', () => {
    const linha = runWithContext({ correlationId: 'c-1', clientRequestId: 'cliente-1' }, () =>
      formatar({ level: 'info', message: 'oi', [LEVEL]: 'info' }));
    expect(linha).toMatchObject({ correlationId: 'c-1', clientRequestId: 'cliente-1', message: 'oi' });
    expect(linha[LEVEL]).toBe('info');
  });

  it('fora de requisição não inventa id', () => {
    expect(formatar({ level: 'info', message: 'subiu' })).not.toHaveProperty('correlationId');
  });

  it('apaga campo sensível aninhado e no primeiro nível', () => {
    const linha = JSON.stringify(formatar({
      level: 'warn', message: 'm', accessToken: 'aaa', data: { user: { password: 'bbb', id: 'u-1' } },
    }));
    expect(linha).not.toMatch(/aaa|bbb/);
    expect(linha).toContain('u-1');
  });
});
