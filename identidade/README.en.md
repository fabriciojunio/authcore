# Identity with Keycloak and Kong

*[Leia em português](README.md)*

AuthCore handles authentication inside the application itself. This folder shows the other
approach, the one larger companies usually take: a separate identity provider (Keycloak), a
gateway at the edge (Kong) and services that only trust the token.

```
browser ── login (Authorization Code + PKCE) ──> Keycloak :8180
   │
   └── Bearer token ──> Kong :8000 ──> recursos (Spring Boot, no published port)
                         │                 │
                         │                 └─ checks again: signature, issuer,
                         │                    audience and the "analista" role
                         └─ checks signature and expiry, limits 20 req/min per IP
```

## What is here

| Folder | What |
|---|---|
| `keycloak/realm-authcore.json` | realm with the public client `authcore-web` (PKCE S256 required, no implicit flow or direct password login, exact redirect), audience mapper, brute-force protection and a 5-minute token |
| `kong/kong.modelo.yml` | Kong without a database or admin API: `jwt` plugin with RS256, per-IP limit, body size limit |
| `recursos/` | Spring Boot 4 service that validates the token again. It does not trust Kong |
| `prova/prova.py` | PKCE login through the Keycloak form and the attacks, using only the Python standard library |

The passwords for ana, bruno and the `outro-servico` client are not in the repository:
`provar.sh` generates random values on every run and Keycloak reads them from the environment.

## How to run

Requires Docker, Python 3 and OpenSSL.

```bash
bash identidade/provar.sh      # starts everything, runs the proof and tears it down
cd identidade/recursos && mvn verify   # service tests only
```

The proof runs in CI on every push, in the "Identidade (Keycloak + Kong)" job.

## What the proof checks

- an authorization request without PKCE is refused
- a `redirect_uri` outside the list gets no code
- a code exchanged without `code_verifier`, or with another flow's, is refused
- the same code cannot be used twice
- direct password login (password grant) is disabled
- without a token, Kong answers 401
- a token with altered content or with `alg: none` is stopped at Kong
- a user without the `analista` role gets 403 from the service
- a valid token from the same Keycloak, but issued for another service, is refused by audience
- Kong cuts the excess with 429
- the service has no published port

In the service, `ValidacaoDoTokenTest` signs real tokens with its own RSA key and a local JWKS,
and checks wrong issuer, wrong audience, expired token, another key with the same `kid` and
`alg: none`.

## AuthCore or Keycloak?

| | AuthCore (the rest of this repository) | Keycloak |
|---|---|---|
| Where the password lives | in the application database | in the identity provider |
| Token | HS256, issued and checked by the same API | RS256, issued by one and checked by many with the public key |
| Several systems with one login | no | yes (SSO, OIDC, SAML) |
| MFA and passkeys | implemented here, with tests | built in, configured in the realm |
| Operating cost | one more API | another critical service, with its own database, upgrades and backups |
| When to use | a single product, very specific login rules, small team | several services or systems, corporate login, central auditing |

In practice: writing authentication yourself, as in AuthCore, teaches where each flaw lives. In
production with more than one service, I would use Keycloak (or another ready-made provider) and
let each service only validate the token, as `recursos` does.

## Limits

This is a lab environment: Keycloak in `start-dev`, no TLS and an in-memory database. Production
would need TLS everywhere, Keycloak in `start` mode with Postgres, a rotating signing key and
Kong reading the key from JWKS instead of a generated file.
