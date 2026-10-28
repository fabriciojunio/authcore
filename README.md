# AuthCore

*[Read this in English](README.en.md)*

[![Demo](https://img.shields.io/badge/Demo-authcore.vercel.app-000000?style=flat-square&logo=vercel&logoColor=white)](https://frontend-tan-mu-38.vercel.app)

Serviço de autenticação e autorização com cadastro de produtos por dono. Login com JWT e renovação
por cookie HttpOnly, 2FA por TOTP, papéis (ADMIN, MANAGER, USER), posse de recurso conferida no
servidor e upload de imagem tratado. O foco do projeto é segurança de aplicação: cada controle tem
um teste que o prova, e o que ainda falta está escrito.

## Estado dos fluxos

Login e renovação usam o contrato HTTP da API: `data.accessToken` e cookie HttpOnly para o refresh.
O cadastro retorna uma mensagem e deixa a conta pendente; não autentica sozinho. O envio de e-mail e
a ativação autônoma ainda não estão completos. O modo demonstração usa dados locais e não dá acesso
à API.

Antes de atualizar o back-end, aplique as migrações nesta ordem: a de `sessionVersion` e a
`EncryptTwoFactorSecret`, que cifra os segredos TOTP já gravados e precisa da mesma `ENCRYPTION_KEY`
da aplicação.

## Tecnologias

**Back-end:** Node.js 22 · TypeScript · Express · TypeORM · PostgreSQL · Redis · Zod
**Front-end:** React 18 · TypeScript · Vite · Zustand · React Query
**Infraestrutura:** Docker · Nginx · GitHub Actions
**Segurança:** Helmet · JWT HS256 · bcrypt · AES-256-GCM · limite de requisições · CORS · HPP

## Arquitetura

```
authcore/
├── backend/                     # API Node.js
│   ├── src/
│   │   ├── config/              # aplicação, banco, Redis, Swagger
│   │   ├── controllers/         # entrada HTTP, camada fina
│   │   ├── errors/              # hierarquia de erros
│   │   ├── middlewares/         # autenticação, erro, validação, segurança
│   │   ├── migrations/          # TypeORM, incluindo a cifra do segredo TOTP
│   │   ├── models/              # entidades TypeORM
│   │   ├── repositories/        # acesso a dados (Repository)
│   │   ├── routes/              # rotas com schemas Zod e Swagger
│   │   ├── services/            # regras de negócio
│   │   └── utils/               # cifra de campo, logger, sanitizador
│   └── tests/
│       ├── unit/
│       └── integration/         # rotas por HTTP, IDOR, Postgres real
├── frontend/                    # SPA React
├── docker/                      # imagens, nginx e init do Postgres
├── docs/seguranca/              # modelo de ameaças e checklist ASVS
└── docker-compose.yml
```

| Padrão | Onde |
|---|---|
| Repository | `BaseRepository<T>` concentra o acesso ao banco |
| Camada de serviço | regra de negócio separada do HTTP |
| Factory | `createApp()` separa a aplicação do servidor |
| Strategy | papéis por rota com `authorize(...roles)` |
| Singleton | conexões de banco, Redis e logger |

## Segurança

### Autenticação e sessão
- Token de acesso de 15 min e refresh de 7 dias em cookie HttpOnly, `SameSite=Strict`
- Rotação do refresh com detecção de reuso; refresh guardado como SHA-256
- `sessionVersion` conferida no banco a cada requisição: logout e troca de senha revogam tudo
- Bloqueio após 5 erros e comparação fictícia para conta inexistente
- 2FA por TOTP no login, com o segredo cifrado no banco (AES-256-GCM, chave por HKDF)

### Autorização
- Negação por padrão; o papel vem do banco a cada requisição, não do token
- Posse do produto conferida no serviço: um usuário não edita, apaga nem envia imagem para produto
  de outro, provado por HTTP em `ownership.routes.test.ts`
- Rotas de perfil usam o id do token, nunca o da URL

### Entrada, arquivos e rede
- Zod em todo corpo, consulta e parâmetro; corpo limitado a 10 KB
- Sanitizador que descarta `__proto__`, `constructor` e `prototype`
- Upload de até 5 MB por arquivo e 5 por requisição, decodificado pelo `sharp`; o que ele recusa é
  apagado do disco
- CSRF barrado por `Origin`/`Referer` nas rotas com cookie
- Helmet, CORS com lista explícita, HPP, 100 requisições por 15 min no geral e limite próprio nas
  rotas de autenticação
- Front com CSP sem script inline, Trusted Types e nenhum recurso de terceiro

### Dados e infraestrutura
- bcrypt 12; campos sensíveis fora das consultas e das respostas
- E-mail fora dos logs; o logger troca por `[REDACTED]` senha, token, segredo, cookie e Authorization
- Contêineres sem root, imagens fixadas por digest, `no-new-privileges`
- Postgres com autenticação `scram-sha-256`; a API nunca fica exposta sem o Nginx na frente

### Pipeline
- CodeQL `security-extended`, OSV-Scanner, `npm audit` e gitleaks a cada push
- Dependabot com espera de 7 dias; actions fixadas por SHA
- Achado sem aceite registrado reprova o CI, e aceite vencido também

O detalhe está no [modelo de ameaças](docs/seguranca/modelo-de-ameacas.md), no
[checklist OWASP ASVS 5.0](docs/seguranca/asvs.md) e no [SECURITY.md](SECURITY.md), que também diz
como relatar uma falha.

## Como rodar

Pré-requisitos: Docker com Compose e Node.js 22.

```bash
npm install
cp backend/.env.example backend/.env    # preencha os valores
docker-compose up postgres redis -d
cd backend && npm run migration:run && cd ..
npm run dev
```

Produção local:

```bash
docker-compose up -d --build
docker-compose ps
curl http://localhost/health
```

## API

Documentação interativa em `http://localhost:3001/api-docs`, só em desenvolvimento.

```
POST   /api/v1/auth/register          cadastro (conta pendente)
POST   /api/v1/auth/login             login, com código TOTP quando a conta tem 2FA
POST   /api/v1/auth/refresh           renova o token de acesso
POST   /api/v1/auth/logout            sai e revoga as sessões
GET    /api/v1/auth/me                usuário atual

GET    /api/v1/users/profile          próprio perfil
PATCH  /api/v1/users/profile          altera o perfil
PATCH  /api/v1/users/change-password  troca a senha
DELETE /api/v1/users/account          exclui a conta
GET    /api/v1/users                  lista usuários (ADMIN)
GET    /api/v1/users/:id              usuário (ADMIN; MANAGER só o próprio)

GET    /health                        saúde completa
GET    /health/ready                  readiness
GET    /health/live                   liveness
```

## Testes

```bash
npm run test               # todos
npm run test:coverage      # com cobertura
cd backend && npm run test:watch
```

264 testes no back-end. Oito deles sobem PostgreSQL de verdade e só rodam com
`AUTHCORE_POSTGRES_TEST=1`; no CI rodam sempre. A cobertura mínima exigida é 80% de linhas e 70% de
ramos.

## Variáveis de ambiente

Todas estão em `backend/.env.example`. Obrigatórias em produção:

- `JWT_ACCESS_SECRET`: 64 caracteres ou mais, aleatórios
- `JWT_REFRESH_SECRET`: 64 caracteres ou mais, diferente do de acesso
- `ENCRYPTION_KEY`: 32 caracteres ou mais; cifra o segredo TOTP, então trocá-la exige recifrar a coluna
- `DB_PASSWORD` e `REDIS_PASSWORD`: senhas fortes

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Qualidade de código

- TypeScript em modo estrito
- ESLint com `no-console`, `no-explicit-any` e `no-floating-promises`
- Hierarquia de erros (`AppError`, `ValidationError`, `AuthenticationError`)
- Rotas assíncronas com `express-async-errors`
- Desligamento gracioso com limite de 30 s
