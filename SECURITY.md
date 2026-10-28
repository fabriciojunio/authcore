# Segurança

## Controles implementados

- Login validado no servidor, com papéis de acesso e verificação do estado da conta.
- Tokens de acesso JWT HS256 e renovação por cookie HttpOnly, SameSite=Strict e Secure em produção.
- Rotação de refresh com atualização condicional no PostgreSQL. Reuso invalida a sessão persistida.
- Versão de sessão conferida no banco em cada autenticação; logout e troca de senha revogam o acesso anterior.
- Limite de tentativas, bloqueio temporário, validação de entrada e comparação de senha com bcrypt.
- Consultas públicas omitem campos sensíveis; autenticação utiliza consultas específicas que precisam desses campos.
- Limites de corpo e requisições, configuração de origens permitidas e cabeçalhos de segurança.
- Requisições que alteram estado e carregam cookie precisam de `Origin` (ou `Referer`) da lista de
  origens permitidas, além do cookie `SameSite=Strict`. Origem desconhecida não recebe cabeçalho CORS.
- O sanitizador global descarta as chaves `__proto__`, `constructor` e `prototype`.
- Nome de usuário entra escapado no HTML dos e-mails; os logs de envio guardam o endereço mascarado.
- Upload confinado à pasta configurada, com verificação por `path.relative` ao processar e ao remover.
- Front servido com CSP sem script inline nem eval, Trusted Types obrigatório, HSTS e sem recurso de
  terceiros; a imagem do front roda sem root e o CI confere os cabeçalhos no contêiner.
- Dependências auditadas por `npm audit` e OSV-Scanner, código por CodeQL (`security-extended`) e
  histórico por gitleaks a cada push; actions do CI fixadas por SHA.

Os tempos de expiração e limites dependem da configuração. Confirmar proxy, HTTPS,
origens permitidas e armazenamento de segredos na implantação. O cookie Strict exige
uma arquitetura de domínio compatível; frontend e API em sites distintos precisam
de desenho e proteção contra CSRF apropriados antes de mudar essa configuração.

## Limites conhecidos

- Cadastro cria conta pendente e retorna mensagem genérica. O envio de e-mail e o
  fluxo completo de verificação/ativação ainda precisam ser implementados antes de
  oferecer cadastro autônomo em produção.
- Há verificação TOTP no login para contas configuradas; isso não demonstra um
  fluxo completo de adesão, recuperação e gestão de segundo fator na interface.
- A interface guarda o token de acesso em sessionStorage. O refresh fica no cookie
  HttpOnly. Proteção contra XSS continua necessária; armazenamento de acesso no
  navegador não elimina esse risco.
- Mensagem genérica no cadastro e comparação fictícia no login reduzem alguns
  sinais de enumeração. Não constituem prova de tempo constante ou impossibilidade
  de enumeração por todos os caminhos.
- Exclusão lógica não equivale a eliminação de dados nem define uma política de
  retenção. Backups, auditoria e atendimento aos titulares dependem da operação.
- Logs podem conter identificadores pessoais. Desabilitar console não comprova
  ausência de vazamentos; revisar conteúdo, acesso e retenção dos destinos de log.
- Criptografia, isolamento, recuperação e controles descritos nos arquivos de
  infraestrutura precisam de validação no ambiente implantado.

## Riscos aceitos

Cada aceite tem motivo, mitigação, responsável e data de revisão. Os do CodeQL ficam em
[`.github/codeql-accepted.json`](.github/codeql-accepted.json): o CI barra qualquer achado fora
dessa lista e volta a barrar um aceite quando a data de revisão passa.

| Achado | Motivo | Revisão |
|---|---|---|
| CodeQL `js/missing-token-validation` em `backend/src/app.ts` | A regra só reconhece bibliotecas como `csurf`; a proteção aqui é a verificação de `Origin`/`Referer`, prevista no OWASP CSRF Prevention Cheat Sheet, com testes próprios. | 28/04/2027 |
| `deepmerge`, GHSA-gcqx-w48m-w2h4 (baixa no npm, CVSS 5,3 no OSV) | Vem do Jest e só existe nos testes; não há versão corrigida e a sugestão do npm rebaixaria o Jest para uma versão de 2020. Registrado em [`osv-scanner.toml`](osv-scanner.toml). | 28/04/2027 |

## Validação técnica

A suíte inclui concorrência de refresh e senha, revogação de sessão e contrato HTTP
com PostgreSQL real quando `AUTHCORE_POSTGRES_TEST=1`. O banco permitido nesses testes
é `enterprise_test`; usar ambiente isolado. A migração de versão de sessão precisa
ser aplicada antes de publicar o código que a utiliza.

Testes aprovados não certificam ausência de vulnerabilidades nem conformidade
integral com a LGPD. Mudanças de finalidade, dados e infraestrutura exigem revisão.

## Relato de vulnerabilidade

Enviar detalhes para **fabricioad444@gmail.com**. Evitar divulgar dados pessoais,
credenciais ou exploração reproduzível em uma issue pública. A resposta depende da
disponibilidade do mantenedor; não há prazo de correção contratualmente garantido.
