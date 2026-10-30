# Threat model

*[Leia em português](modelo-de-ameacas.md)*

Reviewed on 28/10/2026, on the `homologação` branch. STRIDE applied to the flows that exist in the
code today. What does not exist yet (self-service sign-up with email, 2FA enrolment in the
interface) is out of scope and listed in [SECURITY.en.md](../../SECURITY.en.md).

## The system in one picture

```
 browser ──HTTPS──> front end (nginx or Vercel) ──HTTPS──> Express API ──> PostgreSQL
                                                              │     └────> Redis
                                                              └──────────> SMTP
```

Trust boundaries: between the browser and anything of ours; between the API and the database (the
API is the only one that talks to it); between the API and SMTP. Redis holds cache and the revoked
token list, so losing Redis must not turn into unauthorized access.

Assets, most sensitive first: password hash and TOTP secret, refresh token, access token, personal
data (name, email, phone), products and images.

## Threats

### Spoofing (S)

| Threat | Control | Evidence |
|---|---|---|
| Guessing a password | bcrypt cost 12; 10 login attempts per 15 min per IP; account locked 15 min after 5 failures | `user.entity.ts`, `security.middleware.ts`, `auth.service.test.ts` |
| Forged token | HS256 with a fixed algorithm on verification, `iss`, `aud` and token type checked; 64+ character secret validated at startup | `token.service.ts`, `token.service.test.ts` |
| Stealing the TOTP secret from the database | secret encrypted with AES-256-GCM; the database alone cannot generate a code | `fieldCipher.ts`, Postgres test in `session.postgres.test.ts` |
| Account enumeration | same message at sign-up for new or existing email; dummy comparison at login | `auth.service.test.ts` |
| Passkey phishing | the signature covers the origin and the RP hash; a response collected on another domain is refused | `passkey.service.test.ts` |
| Assertion replay | single-use challenge read and deleted with `GETDEL`, valid for 5 min | `passkey.service.test.ts`, `passkey.postgres.test.ts` |
| Cloned authenticator | a counter that does not move forward is refused; the `UPDATE` only succeeds if the counter read is still the one in the database | `passkey.service.test.ts` |
| One user's passkey presented as another's | the `userHandle` returned by the device must be the credential's owner | `passkey.service.test.ts` |

Remaining risk: the password policy is still 8 characters with composition rules and does not check
breached-password lists. It is listed as pending in the ASVS checklist.

### Tampering (T)

| Threat | Control | Evidence |
|---|---|---|
| SQL injection | TypeORM with parameters; no query builds text from input | review of `repositories/`, CodeQL |
| Prototype pollution through the JSON body | sanitizer drops `__proto__`, `constructor`, `prototype` and builds objects with `Object.fromEntries` | `hardening.test.ts` |
| Extra field in a PATCH | each route validates with a Zod schema; the product PATCH no longer applies the default status | `ownership.routes.test.ts` |
| TOTP secret swapped between columns or altered in the database | GCM authenticates the value and the column name | `fieldCipher.test.ts` |
| CSRF on refresh and logout | `SameSite=Strict` cookie and `Origin`/`Referer` check against the origin list | `auth.routes.test.ts` |

### Repudiation (R)

Login, failed login, logout, password change and suspected refresh reuse go to the JSON log with user
id, IP and `requestId`. The email no longer goes into the sign-up log.

What is missing, and known to be missing: the log stays in the container's file and console. There
is no shipping to a destination the server itself cannot delete, and no alerting. For a real system
this would be the first item after what is here.

### Information disclosure (I)

| Threat | Control | Evidence |
|---|---|---|
| Reading another user's profile (IDOR) | profile routes use the token id; `GET /users/:id` only for ADMIN, and MANAGER only sees themselves | `ownership.routes.test.ts` |
| Password hash or refresh token in a response | columns with `select: false` and `toSafeObject` on output | `user.entity.test.ts`, HTTP test with Postgres |
| Error details to the client | generic answer with `requestId`; stack trace only in the log | `error.middleware.test.ts` |
| XSS in the front end stealing the token | CSP `default-src 'none'`, no inline script, mandatory Trusted Types, no third-party resource | `frontend/e2e/security.spec.ts`, headers job in CI |
| Personal data and credentials in logs | email masked on delivery and out of sign-up; the logger replaces password, token, secret, cookie and Authorization keys with `[REDACTED]` | `hardening.test.ts`, `auth.service.test.ts` |

The access token is kept in `sessionStorage`. With the current CSP an XSS is hard, but if one happens
it reads the token. The refresh token stays in the HttpOnly cookie, out of reach of scripts.

### Denial of service (D)

Body limited to 10 KB, uploads to 5 MB per file and 5 files per request, an overall limit of 100
requests per 15 minutes per IP with progressive delay from 50, and a separate limit on
authentication routes. Rejected uploads are deleted, so sending garbage repeatedly does not fill the
disk (`ownership.routes.test.ts` and `hardening.test.ts` check the folder afterwards).

The per-IP limit lives in each instance's memory. With more than one replica behind the load
balancer it applies per replica, not in total.

### Elevation of privilege (E)

Every user and product route goes through `authenticate`; roles are checked per route (`authorize`)
and product ownership is checked in the service, because a USER may only edit what they created. On
every request the role comes from the database, not the token, so demoting someone takes effect
immediately. Password change and logout bump `sessionVersion` and invalidate old tokens.

## How this document is kept

When an authentication flow, an owned route or stored data changes, this file and the
[ASVS checklist](asvs.en.md) change in the same pull request. A finding that is not fixed goes into
"Accepted risks" in SECURITY.en.md with a review date.
