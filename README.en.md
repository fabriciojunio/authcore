# AuthCore

*[Leia em português](README.md)*

[![Demo](https://img.shields.io/badge/Demo-authcore.vercel.app-000000?style=flat-square&logo=vercel&logoColor=white)](https://frontend-tan-mu-38.vercel.app)

Authentication and authorization service with per-owner product management. JWT login with refresh
in an HttpOnly cookie, TOTP 2FA, roles (ADMIN, MANAGER, USER), resource ownership checked on the
server and hardened image upload. The focus is application security: every control has a test that
proves it, and what is still missing is written down.

## Flow status

Login and refresh follow the API's HTTP contract: `data.accessToken` plus an HttpOnly cookie for the
refresh token. Sign-up returns a message and leaves the account pending; it does not log the user
in. Email delivery and self-service activation are not complete yet. Demo mode uses local data and
grants no API access.

Before upgrading the back end, run the migrations in this order: the `sessionVersion` one and
`EncryptTwoFactorSecret`, which encrypts TOTP secrets already stored and needs the same
`ENCRYPTION_KEY` as the application.

## Tech stack

**Back end:** Node.js 22 · TypeScript · Express · TypeORM · PostgreSQL · Redis · Zod
**Front end:** React 18 · TypeScript · Vite · Zustand · React Query
**Infrastructure:** Docker · Nginx · GitHub Actions
**Security:** Helmet · JWT HS256 · bcrypt · AES-256-GCM · rate limiting · CORS · HPP

## Architecture

```
authcore/
├── backend/                     # Node.js API
│   ├── src/
│   │   ├── config/              # app, database, Redis, Swagger
│   │   ├── controllers/         # thin HTTP layer
│   │   ├── errors/              # error hierarchy
│   │   ├── middlewares/         # auth, errors, validation, security
│   │   ├── migrations/          # TypeORM, including the TOTP secret encryption
│   │   ├── models/              # TypeORM entities
│   │   ├── repositories/        # data access (Repository)
│   │   ├── routes/              # routes with Zod schemas and Swagger
│   │   ├── services/            # business rules
│   │   └── utils/               # field cipher, logger, sanitizer
│   └── tests/
│       ├── unit/
│       └── integration/         # HTTP routes, IDOR, real Postgres
├── frontend/                    # React SPA
├── docker/                      # images, nginx and Postgres init
├── docs/seguranca/              # threat model and ASVS checklist
└── docker-compose.yml
```

| Pattern | Where |
|---|---|
| Repository | `BaseRepository<T>` holds all database access |
| Service layer | business rules apart from HTTP |
| Factory | `createApp()` separates the app from the server |
| Strategy | per-route roles with `authorize(...roles)` |
| Singleton | database, Redis and logger connections |

## Security

### Authentication and sessions
- 15-minute access token and 7-day refresh token in an HttpOnly, `SameSite=Strict` cookie
- Refresh rotation with reuse detection; refresh stored as SHA-256
- `sessionVersion` checked in the database on every request: logout and password change revoke
  everything
- Lockout after 5 failures and a dummy comparison for unknown accounts
- TOTP 2FA at login, with the secret encrypted in the database (AES-256-GCM, key derived by HKDF)

### Authorization
- Deny by default; the role is read from the database on every request, not from the token
- Product ownership checked in the service: a user cannot edit, delete or upload an image to someone
  else's product, proven over HTTP in `ownership.routes.test.ts`
- Profile routes use the id from the token, never from the URL

### Input, files and network
- Zod on every body, query and parameter; body limited to 10 KB
- Sanitizer that drops `__proto__`, `constructor` and `prototype`
- Uploads up to 5 MB per file and 5 per request, decoded by `sharp`; anything it rejects is deleted
  from disk
- CSRF blocked by `Origin`/`Referer` on cookie routes
- Helmet, explicit CORS list, HPP, 100 requests per 15 minutes overall and a separate limit on auth
  routes
- Front end with a CSP without inline scripts, Trusted Types and no third-party resources

### Data and infrastructure
- bcrypt 12; sensitive fields kept out of queries and responses
- Emails kept out of logs; the logger replaces password, token, secret, cookie and Authorization
  with `[REDACTED]`
- Non-root containers, images pinned by digest, `no-new-privileges`
- Postgres with `scram-sha-256` authentication; the API is never exposed without Nginx in front

### Pipeline
- CodeQL `security-extended`, OSV-Scanner, `npm audit` and gitleaks on every push
- Dependabot with a 7-day cooldown; actions pinned by SHA
- A finding without a recorded acceptance fails CI, and so does an expired acceptance

Details are in the [threat model](docs/seguranca/modelo-de-ameacas.en.md), the
[OWASP ASVS 5.0 checklist](docs/seguranca/asvs.en.md) and [SECURITY.en.md](SECURITY.en.md), which also
explains how to report a vulnerability.

## Running it

Requirements: Docker with Compose and Node.js 22.

```bash
npm install
cp backend/.env.example backend/.env    # fill in the values
docker-compose up postgres redis -d
cd backend && npm run migration:run && cd ..
npm run dev
```

Local production build:

```bash
docker-compose up -d --build
docker-compose ps
curl http://localhost/health
```

## API

Interactive docs at `http://localhost:3001/api-docs`, development only.

```
POST   /api/v1/auth/register          sign up (pending account)
POST   /api/v1/auth/login             log in, with a TOTP code when the account has 2FA
POST   /api/v1/auth/refresh           refresh the access token
POST   /api/v1/auth/logout            log out and revoke sessions
GET    /api/v1/auth/me                current user

GET    /api/v1/users/profile          own profile
PATCH  /api/v1/users/profile          update profile
PATCH  /api/v1/users/change-password  change password
DELETE /api/v1/users/account          delete account
GET    /api/v1/users                  list users (ADMIN)
GET    /api/v1/users/:id              one user (ADMIN; MANAGER only themselves)

GET    /health                        full health check
GET    /health/ready                  readiness
GET    /health/live                   liveness
```

## Tests

```bash
npm run test               # everything
npm run test:coverage      # with coverage
cd backend && npm run test:watch
```

264 back-end tests. Eight of them start a real PostgreSQL and only run with
`AUTHCORE_POSTGRES_TEST=1`; in CI they always run. Minimum coverage is 80% of lines and 70% of
branches.

## Environment variables

All of them are in `backend/.env.example`. Required in production:

- `JWT_ACCESS_SECRET`: 64+ random characters
- `JWT_REFRESH_SECRET`: 64+ characters, different from the access secret
- `ENCRYPTION_KEY`: 32+ characters; it encrypts the TOTP secret, so changing it means re-encrypting
  the column
- `DB_PASSWORD` and `REDIS_PASSWORD`: strong passwords

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Code quality

- TypeScript strict mode
- ESLint with `no-console`, `no-explicit-any` and `no-floating-promises`
- Error hierarchy (`AppError`, `ValidationError`, `AuthenticationError`)
- Async routes through `express-async-errors`
- Graceful shutdown with a 30-second limit
