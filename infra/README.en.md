# AWS infrastructure

*[Leia em português](README.md)*

The API described in OpenTofu. **Nothing here is live:** it is code tested with a mocked provider, no
account and no cost.

```
internet ─443─▶ WAF ▶ ALB (only /api/v1/*) ─3001─▶ 2 Fargate tasks ─┬─5432─▶ PostgreSQL (2 AZs)
                                                   no route to the  ├─6379─▶ Valkey (TLS)
                                                   internet         ├─2049─▶ EFS (uploads)
                                                                    └─443──▶ private AWS endpoints
```

## Decisions

- **The API has no way out.** No NAT Gateway. Whoever takes the container cannot exfiltrate or fetch a
  second stage, and the private endpoints refuse other accounts.
- **The API cannot erase its audit trail.** It connects as `authcore_app`, with only `SELECT` and
  `INSERT` on `audit_logs`. [`banco/provar.sh`](aws/banco/provar.sh) tries ten forbidden things on a
  real PostgreSQL, and the API smoke test runs as that user: enough, and no more.
- **Nor its logs.** The ECS agent writes them with the execution role, out of the API's reach.
- **The edge is an allowlist.** The load balancer answers 404 by default; only `/api/v1/*` goes through.
- **Two rate limits.** The API limits per IP per instance; the WAF across all of them, before bcrypt.
- **WAF logs without credentials.** `Authorization`, `Cookie` and the query are redacted, sampling off.

## Tests

`tofu test` runs 21 cases. Each was checked by breaking the property on purpose: 34 mutations, all
caught by the right case. `backend/tests/unit/deteccao.test.ts` checks that the log messages the alarms
look for are still the ones the code writes.

```bash
cd infra/aws
tofu init -backend=false && tofu validate && tofu test
trivy config --severity MEDIUM,HIGH,CRITICAL .
```

Deployment steps are in the [Portuguese version](README.md#como-subir).

## Not verified

No `apply` on a real account, and the image with the RDS certificate was not built on this machine,
which has no Docker. What depends on AWS behaviour follows the documentation, unproven.

## Left out

CloudTrail, GuardDuty and Security Hub belong to the account. Prometheus rules need a collector inside
the VPC; here detection reads the JSON log. Automatic JWT secret rotation needs the API to accept two
keys at once, which it does not do yet.
