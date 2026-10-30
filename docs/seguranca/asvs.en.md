# OWASP ASVS 5.0 checklist

*[Leia em português](asvs.md)*

Assessed on 28/10/2026 chapter by chapter, targeting level 2. It is not a certification: it is my
reading of the code against the standard, with the file or test that backs each answer. "Partial"
means one part of the chapter is covered and another is not, and the missing part is written down.

| Chapter | Status | Evidence and what is missing |
|---|---|---|
| V1 Encoding and sanitization | Meets | Zod on every route with a body; sanitizer without prototype keys; name escaped in email HTML (`hardening.test.ts`). |
| V2 Validation and business logic | Meets | Schemas per route, 10 KB body limit. The product PATCH that unpublished without being asked was fixed in `681aed6`. |
| V3 Web frontend security | Partial | CSP `default-src 'none'`, Trusted Types, HSTS, no third parties, headers checked in the container by CI. Missing: the access token lives in `sessionStorage`. |
| V4 API and web services | Meets | Explicit CORS list, CSRF via `Origin`/`Referer` on cookie routes, HPP, rate limiting. |
| V5 File handling | Partial | Size and count limited, random name, confined path, `sharp` decodes the image and whatever it rejects is deleted. Missing: antivirus and a separate domain if images are ever served. |
| V6 Authentication | Partial | bcrypt 12, lockout after 5 failures, per-IP limit, TOTP at login, passkeys with required user verification. Missing: the ASVS 5 password policy (longer minimum, no composition rules), a breached-password check and 2FA enrolment in the interface. |
| V7 Session management | Meets | 15-minute access, 7-day refresh with rotation and reuse detection, `sessionVersion` revokes everything on logout and password change (Postgres tests). |
| V8 Authorization | Meets | Deny by default, role read from the database on each request, product ownership in the service; IDOR tested over HTTP in `ownership.routes.test.ts`. |
| V9 Self-contained tokens | Meets | Fixed algorithm, `iss`, `aud`, `exp` and type checked; refresh stored as SHA-256. |
| V10 OAuth and OIDC | Not applicable today | AuthCore issues its own tokens. It becomes applicable when Keycloak comes in. |
| V11 Cryptography | Meets | TOTP secret with AES-256-GCM, key by HKDF, random IV, column as authenticated data (`fieldCipher.test.ts`). No automated key rotation. |
| V12 Secure communication | Depends on deployment | HSTS on the front end; database TLS is configurable (`DB_SSL`). The code does not force TLS between API and database. |
| V13 Configuration | Partial | Variables validated with Zod at startup, secrets with a minimum length, images pinned by digest, containers without root and with `no-new-privileges`. The front-end one is tested in CI with a read-only file system; the API one still runs with `read_only: false` in compose. |
| V14 Data protection | Partial | Email out of logs, sensitive fields out of responses. Missing: soft delete does not erase data, there is no retention policy. |
| V15 Secure coding and architecture | Meets | CodeQL `security-extended`, OSV-Scanner, gitleaks, `npm audit`, Dependabot with a 7-day cooldown, actions by SHA. Acceptances with deadlines in SECURITY.en.md. |
| V16 Logging and error handling | Partial | JSON with `requestId`, authentication events logged, generic error to the client. Missing: logs off the server and alerting. |
| V17 WebRTC | Not applicable | |

## What comes first

By risk: password policy and breached-password check (V6), logs off the server (V16), access token
out of `sessionStorage` (V3). All three touch the contract with the front end or the infrastructure,
which is why they did not go in with this round of code fixes.
