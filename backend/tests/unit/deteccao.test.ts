import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../..');
const ler = (arquivo: string) => readFileSync(path.join(RAIZ, arquivo), 'utf8');

// O alarme da nuvem procura a mensagem no log. Reescrever a mensagem no código
// desligaria a detecção sem nenhum erro aparecer.
describe('a detecção acompanha o código', () => {
  const codigo = execFileSync('git', ['ls-files', 'backend/src'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.ts')).map(ler).join('\n');

  const mensagens = [...ler('infra/aws/deteccao.tf').matchAll(/mensagem = "([^"]+)"/g)].map((m) => m[1]!);

  it('existem mensagens para conferir', () => {
    expect(mensagens.length).toBeGreaterThanOrEqual(3);
  });

  it.each(mensagens)('o código ainda escreve "%s"', (mensagem) => {
    expect(codigo).toMatch(new RegExp(`logger\\.(warn|error)\\('${mensagem}'`));
  });

  it('todo evento usado nas regras do Prometheus existe na métrica', () => {
    const metricas = ler('backend/src/observability/metrics.ts');
    const eventos = [...ler('observabilidade/regras.yml').matchAll(/event="([^"]+)"/g)].map((m) => m[1]!);
    expect(eventos.length).toBeGreaterThan(0);
    new Set(eventos).forEach((evento) => expect(metricas).toMatch(new RegExp(`'?${evento.replace('.', '\\.')}'?: `)));
  });

  it('todo alerta aponta para uma seção que existe no runbook', () => {
    const ancora = (titulo: string) => titulo.toLowerCase().replace(/[^\p{L}\d ]/gu, '').trim().replace(/ /g, '-')
      .normalize('NFD').replace(/\p{M}/gu, '');
    const secoes = [...ler('docs/operacao.md').matchAll(/^### (.+)$/gm)].map((m) => ancora(m[1]!));
    const citadas = [...ler('observabilidade/regras.yml').matchAll(/operacao\.md#([\w-]+)/g)].map((m) => m[1]!);
    expect(citadas.length).toBeGreaterThan(5);
    citadas.forEach((c) => expect(secoes).toContain(c));
  });
});
