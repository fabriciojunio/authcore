# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅        |
| < 1.0   | ❌        |

## Security Features

### Authentication & Authorization
- JWT access tokens with 15-minute expiry
- httpOnly, SameSite=Strict refresh token cookies
- Refresh token rotation — reuse detected and all sessions invalidated
- Token blacklisting in Redis on logout
- Account lockout after 5 failed login attempts (15 minutes)
- Timing-safe credential comparison (prevents user enumeration)
- Two-Factor Authentication (TOTP)
- RBAC (admin / manager / user roles)

### API Security
- Helmet.js with strict Content Security Policy
- HSTS with 1-year max-age + preload
- Rate limiting: 100 req/15min global, 10 req/15min on auth endpoints
- HTTP Parameter Pollution (hpp) protection
- Input sanitization (XSS filtering on all body fields)
- Request body size limit (10KB)
- CORS whitelist enforced

### Data Security
- bcrypt with 12 rounds for password hashing
- Sensitive fields excluded from all DB select queries
- Soft deletes (audit trail preserved)
- DB fields encrypted where needed (AES-256)
- Secrets validated at startup (never silently undefined)
- Console output completely disabled in production (zero data leaks)

### Infrastructure
- Non-root Docker containers (UID 1001)
- Read-only container filesystem (with tmpfs for /tmp)
- `no-new-privileges` security option
- Resource limits on all containers
- PostgreSQL scram-sha-256 authentication
- Redis password required + protected-mode on
- Nginx as reverse proxy (API never directly exposed)

### Code Quality
- TypeScript strict mode
- ESLint with `no-any`, `no-console`, `no-floating-promises` enforced
- Zod schema validation on all inputs (body, query, params)
- All async routes wrapped in express-async-errors

## Reporting a Vulnerability

Please report security vulnerabilities to **security@enterprise.com**.

Do **not** file a public GitHub issue for security vulnerabilities.

We aim to acknowledge all reports within **48 hours** and will provide
updates every 5 business days. Critical vulnerabilities are patched and
released within **7 days** of confirmation.

## Generating Secrets

```bash
# JWT secrets (min 64 characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Encryption key (exactly 32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```
