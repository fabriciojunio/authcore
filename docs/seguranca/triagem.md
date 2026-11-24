# Registro de triagem

*[Read this in English](triagem.en.md)*

Achados de ferramenta analisados e fechados sem mudança de código, com a evidência. Fechar alerta
sem prova não vale.

| Data | Ferramenta e regra | Onde | Decisão | Por quê |
|---|---|---|---|---|
| 13/11/2026 | CodeQL `js/clear-text-logging` (alerta 7) | `backend/src/services/audit.service.ts:52` | falso positivo | O log grava o nome da ação (`AuditAction.PASSWORD_CHANGE`), que é um rótulo fixo do enum, e o id do usuário. A heurística do CodeQL vê "PASSWORD" no nome e supõe uma senha. Nenhuma senha, hash, token ou IP passa por esse log: o erro do driver é reduzido a `error.name` justamente porque carrega os parâmetros do INSERT. |

## Como reabrir

Se algum dia o `details` de um evento entrar no log de erro, ou se a ação passar a carregar valor
digitado pelo usuário, a decisão perde a base e o alerta volta a valer.
