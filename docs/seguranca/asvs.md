# Checklist OWASP ASVS 5.0

*[Read this in English](asvs.en.md)*

Avaliação feita em 28/10/2026 por capítulo, tendo o nível 2 como alvo. Não é certificação: é a
minha leitura do código contra o padrão, com o arquivo ou teste que sustenta cada resposta. "Parcial"
quer dizer que uma parte do capítulo está coberta e outra não, e a parte que falta está escrita.

| Capítulo | Situação | Evidência e o que falta |
|---|---|---|
| V1 Codificação e sanitização | Atende | Zod em toda rota com corpo; sanitizador sem chaves de protótipo; nome escapado no HTML do e-mail (`hardening.test.ts`). |
| V2 Validação e lógica de negócio | Atende | Schemas por rota, limite de corpo de 10 KB. O PATCH de produto que despublicava sem pedir foi corrigido em `681aed6`. |
| V3 Segurança do front | Parcial | CSP `default-src 'none'`, Trusted Types, HSTS, sem terceiros, cabeçalhos conferidos no contêiner pelo CI. Falta: o access token fica em `sessionStorage`. |
| V4 API e serviços web | Atende | CORS com lista explícita, CSRF por `Origin`/`Referer` nas rotas de cookie, HPP, limite de requisições. |
| V5 Arquivos | Parcial | Tamanho e quantidade limitados, nome aleatório, caminho confinado, o `sharp` decodifica a imagem e o que ele recusa é apagado. Falta: antivírus e um domínio separado se as imagens um dia forem servidas. |
| V6 Autenticação | Parcial | bcrypt 12, bloqueio após 5 erros, limite por IP, TOTP no login. Falta: política de senha do ASVS 5 (mínimo maior e sem regra de composição), checagem contra senhas vazadas e a adesão ao 2FA pela interface. |
| V7 Sessão | Atende | Access de 15 min, refresh de 7 dias com rotação e detecção de reuso, `sessionVersion` revoga tudo no logout e na troca de senha (testes com Postgres). |
| V8 Autorização | Atende | Negação por padrão, papel lido do banco a cada requisição, posse do produto no serviço; IDOR testado pelo HTTP em `ownership.routes.test.ts`. |
| V9 Tokens autocontidos | Atende | Algoritmo fixo, `iss`, `aud`, `exp` e tipo conferidos; refresh guardado como SHA-256. |
| V10 OAuth e OIDC | Não se aplica hoje | O AuthCore emite os próprios tokens. Vira aplicável quando entrar o Keycloak. |
| V11 Criptografia | Atende | Segredo TOTP com AES-256-GCM, chave por HKDF, IV aleatório, coluna como dado autenticado (`fieldCipher.test.ts`). Sem rotação de chave automatizada. |
| V12 Comunicação | Depende da implantação | HSTS no front; TLS do banco é configurável (`DB_SSL`). O código não força TLS entre API e banco. |
| V13 Configuração | Parcial | Variáveis validadas com Zod na subida, segredos com tamanho mínimo, imagens fixadas por digest, contêineres sem root e com `no-new-privileges`. O do front é testado no CI com sistema de arquivos somente leitura; o da API ainda sobe com `read_only: false` no compose. |
| V14 Proteção de dados | Parcial | E-mail fora dos logs, campos sensíveis fora das respostas. Falta: exclusão lógica não apaga dado, não há política de retenção. |
| V15 Código e arquitetura | Atende | CodeQL `security-extended`, OSV-Scanner, gitleaks, `npm audit`, Dependabot com espera de 7 dias, actions por SHA. Aceites com prazo no SECURITY.md. |
| V16 Logs e erros | Parcial | JSON com `requestId`, eventos de autenticação registrados, erro genérico para o cliente. Falta: log fora do servidor e alerta. |
| V17 WebRTC | Não se aplica | |

## O que vem primeiro

Pela ordem de risco: política de senha e checagem de senha vazada (V6), log fora do servidor (V16),
access token fora do `sessionStorage` (V3). Os três mexem em contrato com o front ou em
infraestrutura, por isso não entraram junto com as correções de código desta rodada.
