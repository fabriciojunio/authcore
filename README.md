# Enterprise Full-Stack Application

## Tech Stack

**Backend:** Node.js · TypeScript · Express · TypeORM · PostgreSQL · Redis  
**Frontend:** React 18 · TypeScript · Vite · Zustand · React Query  
**Infrastructure:** Docker · Nginx · GitHub Actions  
**Security:** Helmet · JWT RS256 · bcrypt · Rate Limiting · CORS · HPP  

---

## Architecture

```
enterprise-project/
├── backend/                     # Node.js API
│   ├── src/
│   │   ├── config/              # App, DB, Redis, Swagger config
│   │   ├── controllers/         # HTTP request handlers (thin layer)
│   │   ├── errors/              # Custom error hierarchy
│   │   ├── middlewares/         # Auth, error, validation, security
│   │   ├── models/              # TypeORM entities
│   │   ├── repositories/        # Data access layer (Repository Pattern)
│   │   ├── routes/              # Route definitions with Swagger docs
│   │   ├── services/            # Business logic (Service Layer)
│   │   └── validators/          # Zod schemas for input validation
│   └── tests/
│       ├── unit/                # Unit tests (services, utils)
│       └── integration/         # Integration tests (routes, DB)
├── frontend/                    # React SPA
│   └── src/
│       ├── services/            # API client with interceptors
│       └── store/               # Zustand global state
├── docker/
│   ├── Dockerfile.backend       # Multi-stage production image
│   ├── nginx/                   # Reverse proxy config
│   └── postgres/                # DB initialization
└── docker-compose.yml           # Full stack orchestration
```

### Design Patterns Applied

| Pattern | Where |
|---|---|
| **Repository Pattern** | `BaseRepository<T>` abstracts all DB access |
| **Service Layer** | Business logic isolated from HTTP layer |
| **Factory Pattern** | `createApp()` separates app from server |
| **Strategy Pattern** | Auth middleware roles via `authorize(...roles)` |
| **Observer Pattern** | Event emitter for auth logout events |
| **Singleton** | DB, Redis, Logger instances |

---

## Security Features

### Authentication
- JWT access tokens (15min) + httpOnly refresh tokens (7 days)
- Refresh token rotation with reuse detection
- Token blacklist via Redis on logout
- Account lockout after 5 failed attempts
- Timing-safe password comparison (prevents user enumeration)
- 2FA via TOTP (Google Authenticator compatible)

### Network Security
- Helmet with strict CSP, HSTS, X-Frame-Options, noSniff
- Rate limiting: 100 req/15min global, 10 req/15min on auth
- HTTP Parameter Pollution (HPP) protection
- XSS sanitization on all inputs
- Body size limits (10KB max)
- CORS whitelist only

### Data Security
- bcrypt with 12 rounds for passwords
- Sensitive fields excluded from DB selects by default
- Soft deletes (data never permanently lost)
- Audit log table for compliance
- No secrets in code (validated env config)
- Console output disabled in production (no data leaks)

### Infrastructure
- Non-root Docker containers
- Read-only filesystem where possible
- `dumb-init` for proper signal handling
- Nginx as reverse proxy (API never exposed directly)
- PostgreSQL `scram-sha-256` authentication

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+

### Development
```bash
# 1. Clone and install
npm install

# 2. Setup environment
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# 3. Start infrastructure
docker-compose up postgres redis -d

# 4. Run migrations
cd backend && npm run migration:run

# 5. Start development servers
npm run dev
```

### Production
```bash
# Build and start all services
docker-compose up -d --build

# Check status
docker-compose ps
curl http://localhost/health
```

---

## API Documentation

Available at `http://localhost:3001/api-docs` (development only)

### Endpoints

```
POST   /api/v1/auth/register     Register new user
POST   /api/v1/auth/login        Login
POST   /api/v1/auth/refresh      Refresh access token
POST   /api/v1/auth/logout       Logout (requires auth)
GET    /api/v1/auth/me           Current user info

GET    /api/v1/users/profile     Get own profile
PATCH  /api/v1/users/profile     Update profile
PATCH  /api/v1/users/change-password  Change password
DELETE /api/v1/users/account     Delete account
GET    /api/v1/users             List users (admin only)
GET    /api/v1/users/:id         Get user (admin/manager)

GET    /health                   Full health check
GET    /health/ready             Readiness probe (k8s)
GET    /health/live              Liveness probe (k8s)
```

---

## Testing

```bash
# Run all tests
npm run test

# With coverage report
npm run test:coverage

# Watch mode
cd backend && npm run test:watch
```

Coverage thresholds enforced: 80% lines, 70% branches

---

## Environment Variables

See `backend/.env.example` for all required variables with descriptions.

**Required for production:**
- `JWT_ACCESS_SECRET` — min 64 chars, cryptographically random
- `JWT_REFRESH_SECRET` — min 64 chars, different from access secret
- `ENCRYPTION_KEY` — exactly 32 chars
- `DB_PASSWORD` — strong password
- `REDIS_PASSWORD` — strong password

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Code Quality

- TypeScript strict mode enabled
- ESLint with `no-console`, `no-any`, `no-floating-promises` rules
- Zod validation on all inputs (request body, query, params)
- Custom error hierarchy (`AppError → ValidationError → AuthenticationError`)
- All async routes wrapped in `express-async-errors`
- Graceful shutdown with 30s timeout
