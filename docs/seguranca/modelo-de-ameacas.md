# Modelo de ameaças

*[Read this in English](modelo-de-ameacas.en.md)*

Revisado em 28/10/2026, sobre o branch `homologação`. Método STRIDE aplicado aos fluxos que existem
hoje no código. O que ainda não existe (cadastro autônomo com e-mail, adesão ao 2FA pela interface)
fica fora e está listado em [SECURITY.md](../../SECURITY.md).

## O sistema em uma figura

```
 navegador ──HTTPS──> front (nginx ou Vercel) ──HTTPS──> API Express ──> PostgreSQL
                                                            │     └────> Redis
                                                            └──────────> SMTP
```

Fronteiras de confiança: entre o navegador e qualquer coisa nossa; entre a API e o banco (a API é
a única que fala com ele); entre a API e o SMTP. O Redis guarda cache e lista de tokens revogados,
então perder o Redis não pode virar acesso indevido.

Ativos, do mais sensível para o menos: hash de senha e segredo TOTP, refresh token, access token,
dados pessoais (nome, e-mail, telefone), produtos e imagens.

## Ameaças

### Falsificação de identidade (S)

| Ameaça | Controle | Onde está a prova |
|---|---|---|
| Adivinhar senha | bcrypt custo 12; 10 tentativas de login a cada 15 min por IP; conta bloqueada 15 min após 5 erros | `user.entity.ts`, `security.middleware.ts`, `auth.service.test.ts` |
| Token forjado | HS256 com algoritmo fixo na verificação, `iss`, `aud` e tipo do token conferidos; segredo com 64+ caracteres validado na subida | `token.service.ts`, `token.service.test.ts` |
| Roubo do segredo TOTP pelo banco | segredo cifrado com AES-256-GCM; o banco sozinho não gera código | `fieldCipher.ts`, teste com Postgres em `session.postgres.test.ts` |
| Enumeração de contas | mesma mensagem no cadastro com e-mail novo ou repetido; comparação fictícia no login | `auth.service.test.ts` |
| Phishing da passkey | a assinatura cobre a origem e o hash do RP; resposta colhida em outro domínio é recusada | `passkey.service.test.ts` |
| Replay da asserção | desafio de uso único lido e apagado com `GETDEL`, válido por 5 min | `passkey.service.test.ts`, `passkey.postgres.test.ts` |
| Autenticador clonado | contador que não avança é recusado; o `UPDATE` só passa se o contador lido ainda for o do banco | `passkey.service.test.ts` |
| Passkey de um usuário apresentada como de outro | o `userHandle` devolvido pelo aparelho tem de ser o dono da credencial | `passkey.service.test.ts` |

O risco que sobra: a política de senha ainda é 8 caracteres com regra de composição e não consulta
listas de senhas vazadas. Está no checklist ASVS como pendente.

### Adulteração (T)

| Ameaça | Controle | Onde está a prova |
|---|---|---|
| Injeção de SQL | TypeORM com parâmetros; nenhuma consulta monta texto com entrada | revisão de `repositories/`, CodeQL |
| Prototype pollution pelo corpo JSON | sanitizador descarta `__proto__`, `constructor`, `prototype` e cria objetos com `Object.fromEntries` | `hardening.test.ts` |
| Campo extra no PATCH | cada rota valida com schema Zod; o PATCH de produto não aplica mais o status padrão | `ownership.routes.test.ts` |
| Segredo TOTP trocado entre colunas ou alterado no banco | GCM autentica o valor e o nome da coluna | `fieldCipher.test.ts` |
| CSRF no refresh e no logout | cookie `SameSite=Strict` e checagem de `Origin`/`Referer` contra a lista de origens | `auth.routes.test.ts` |

### Repúdio (R)

Login, falha de login, logout, troca de senha e suspeita de reuso de refresh vão para o log em JSON
com id do usuário, IP e `requestId`. O e-mail não entra mais no log de cadastro.

O que falta e eu sei que falta: o log fica no arquivo e no console do contêiner. Não há envio para
um destino que o próprio servidor não consiga apagar, nem alerta. Para um sistema de verdade isso
seria o primeiro item depois do que já está aqui.

### Vazamento de informação (I)

| Ameaça | Controle | Onde está a prova |
|---|---|---|
| Ler perfil de outro usuário (IDOR) | rotas de perfil usam o id do token; `GET /users/:id` só para ADMIN, e o MANAGER só vê o próprio | `ownership.routes.test.ts` |
| Hash de senha ou refresh na resposta | colunas com `select: false` e `toSafeObject` na saída | `user.entity.test.ts`, teste HTTP com Postgres |
| Detalhe de erro para o cliente | resposta genérica com `requestId`; pilha só no log | `error.middleware.test.ts` |
| XSS no front levando o token | CSP `default-src 'none'`, sem script inline, Trusted Types obrigatório, nenhum recurso de terceiro | `frontend/e2e/security.spec.ts`, job de cabeçalhos no CI |
| Dado pessoal e credencial em log | e-mail mascarado no envio e fora do cadastro; o logger troca por `[REDACTED]` as chaves de senha, token, segredo, cookie e Authorization | `hardening.test.ts`, `auth.service.test.ts` |

O access token fica em `sessionStorage`. Com a CSP atual um XSS é difícil, mas se acontecer ele lê
o token. Refresh fica no cookie HttpOnly, que o script não alcança.

### Negação de serviço (D)

Corpo limitado a 10 KB, upload a 5 MB por arquivo e 5 arquivos por requisição, limite geral de 100 requisições por
15 minutos por IP com atraso progressivo a partir de 50, e limite próprio nas rotas de autenticação.
Arquivo recusado no upload é apagado, então mandar lixo repetidas vezes não enche o disco
(`ownership.routes.test.ts` e `hardening.test.ts` conferem a pasta depois).

O limite por IP mora na memória de cada instância. Com mais de uma réplica atrás do balanceador ele
vale por réplica, não no total.

### Elevação de privilégio (E)

Toda rota de usuário e de produto passa por `authenticate`; papéis são checados por rota
(`authorize`) e a posse do produto é checada no serviço, porque o USER pode editar só o que criou.
A cada requisição o papel vem do banco, não do token, então rebaixar alguém vale na hora. Troca de
senha e logout aumentam `sessionVersion` e invalidam tokens antigos.

## Como este documento é mantido

Mudou um fluxo de autenticação, uma rota com dono ou um dado guardado, este arquivo e o
[checklist ASVS](asvs.md) mudam no mesmo PR. Achado que não for corrigido entra em "Riscos aceitos"
no SECURITY.md com data de revisão.
