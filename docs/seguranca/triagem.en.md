# Triage log

*[Leia em português](triagem.md)*

Tool findings that were analysed and closed without a code change, with the evidence. Closing an
alert without proof does not count.

| Date | Tool and rule | Where | Decision | Why |
|---|---|---|---|---|
| 2026-11-13 | CodeQL `js/clear-text-logging` (alert 7) | `backend/src/services/audit.service.ts:52` | false positive | The log records the action name (`AuditAction.PASSWORD_CHANGE`), a fixed enum label, and the user id. CodeQL's heuristic sees "PASSWORD" in the name and assumes a password. No password, hash, token or IP goes through this log: the driver error is reduced to `error.name` precisely because it carries the INSERT parameters. |

## When to reopen

If an event's `details` ever reaches the error log, or the action starts carrying user-typed values,
the decision loses its basis and the alert applies again.
