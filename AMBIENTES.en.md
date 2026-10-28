# Staging and production

*[Leia em português](AMBIENTES.md)*

| Branch | Use |
|---|---|
| `homologação` | Integrating changes and validating them before release. |
| `produção` | Default branch; receives verified changes through pull requests. |

The flow is: work branch → `homologação` → `produção`. Keep the accented names in Git commands and
integration settings.

Before promoting a change, run the applicable tests and checks, review the diff and check
migrations, configuration and the rollback procedure. A failing test must be fixed or investigated
before promotion.

Existing workflows must validate changes on both branches; automatic production releases stay
restricted to the `produção` branch.

Branches organise the code. A published staging environment needs its own hosting, database and
credentials; do not reuse personal data or production secrets in tests. The existence of the branch
does not prove those resources are already provisioned.

In Git-connected hosting, set `produção` as the source of public releases and `homologação` as the
source of validation releases, where that feature exists. Addresses, variables and permissions must
be checked per environment.
