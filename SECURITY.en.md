# Security

*[Leia em português](SECURITY.md)*

## Implemented controls

- Login validated on the server, with access roles and an account status check.
- HS256 JWT access tokens and refresh through an HttpOnly, SameSite=Strict cookie, Secure in
  production.
- Refresh rotation with a conditional update in PostgreSQL. Reuse invalidates the stored session.
- Session version checked in the database on every authentication; logout and password change
  revoke earlier access.
- Attempt limits, temporary lockout, input validation and password comparison with bcrypt.
- Public queries leave sensitive fields out; authentication uses dedicated queries that need them.
- Body and request limits, allowed-origin configuration and security headers.
- State-changing requests that carry the cookie need an `Origin` (or `Referer`) from the allowed
  list, on top of the `SameSite=Strict` cookie. Unknown origins get no CORS header.
- The global sanitizer drops the keys `__proto__`, `constructor` and `prototype`.
- User names are escaped in email HTML; delivery logs keep the address masked.
- TOTP secret encrypted in the database with AES-256-GCM (key derived from `ENCRYPTION_KEY` by HKDF,
  column name as authenticated data). The `EncryptTwoFactorSecret` migration encrypts existing
  values and must run with the application's key; changing the key means re-encrypting the column.
- Uploads confined to the configured folder, checked with `path.relative` when processing and when
  deleting.
- Front end served with a CSP without inline scripts or eval, mandatory Trusted Types, HSTS and no
  third-party resources; the front-end image runs without root and CI checks the headers in the
  container.
- Dependencies audited by `npm audit` and OSV-Scanner, code by CodeQL (`security-extended`) and
  history by gitleaks on every push; CI actions pinned by SHA.

Expiry times and limits depend on configuration. Check proxy, HTTPS, allowed origins and secret
storage in the deployment. The Strict cookie needs a compatible domain layout; a front end and API on
different sites need proper design and CSRF protection before this setting changes.

## Known limits

- Sign-up creates a pending account and returns a generic message. Email delivery and the full
  verification and activation flow still need to be built before self-service sign-up in
  production.
- TOTP is checked at login for accounts that have it set up; this does not show a full enrolment,
  recovery and second-factor management flow in the interface.
- The interface keeps the access token in sessionStorage. The refresh token stays in the HttpOnly
  cookie. XSS protection is still needed; keeping the access token in the browser does not remove
  that risk.
- A generic sign-up message and a dummy comparison at login reduce some enumeration signals. They do
  not prove constant time or that enumeration is impossible on every path.
- Soft delete is not data erasure and does not define a retention policy. Backups, auditing and
  data subject requests depend on operations.
- Logs may contain personal identifiers. Turning the console off does not prove there are no leaks;
  review content, access and retention of log destinations.
- Encryption, isolation, recovery and controls described in infrastructure files need validation in
  the deployed environment.

## Accepted risks

Each acceptance has a reason, mitigation, owner and review date. CodeQL ones live in
[`.github/codeql-accepted.json`](.github/codeql-accepted.json): CI blocks any finding outside that
list and blocks an acceptance again once its review date passes.

| Finding | Reason | Review |
|---|---|---|
| CodeQL `js/missing-token-validation` in `backend/src/app.ts` | The rule only recognises libraries such as `csurf`; protection here is the `Origin`/`Referer` check, listed in the OWASP CSRF Prevention Cheat Sheet, with its own tests. | 28/04/2027 |
| `deepmerge`, GHSA-gcqx-w48m-w2h4 (low in npm, CVSS 5.3 in OSV) | Comes from Jest and only exists in tests; there is no fixed version and npm's suggestion would downgrade Jest to a 2020 release. Recorded in [`osv-scanner.toml`](osv-scanner.toml). | 28/04/2027 |

## Technical validation

The suite covers refresh and password concurrency, session revocation and the HTTP contract with a
real PostgreSQL when `AUTHCORE_POSTGRES_TEST=1`. The database allowed in those tests is
`enterprise_test`; use an isolated environment. The session version migration must be applied
before releasing code that relies on it.

Passing tests do not certify the absence of vulnerabilities or full LGPD compliance. Changes in
purpose, data or infrastructure need review.

## Documents

[Threat model (STRIDE)](docs/seguranca/modelo-de-ameacas.en.md) and
[OWASP ASVS 5.0 checklist](docs/seguranca/asvs.en.md), with what is covered, the evidence for each
item and what is missing.

## Reporting a vulnerability

Use GitHub's private reporting (the **Security** tab, **Report a vulnerability**) or send details to
**fabricioad444@gmail.com**. Do not disclose personal data, credentials or a reproducible exploit in
a public issue. Response depends on the maintainer's availability; there is no contractual fix
deadline.
