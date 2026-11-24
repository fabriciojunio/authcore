#!/usr/bin/env bash
# Prova que o usuário da aplicação não mexe na trilha nem no esquema.
# Espera PGHOST, PGPORT, PGDATABASE, PGUSER e PGPASSWORD do dono, com as migrações aplicadas.
set -euo pipefail
cd "$(dirname "$0")"
senha="$(openssl rand -hex 16)"
psql -q -v ON_ERROR_STOP=1 -v senha="$senha" -f usuario-da-aplicacao.sql

app() { PGUSER=authcore_app PGPASSWORD="$senha" psql -qAt -v ON_ERROR_STOP=1 -c "$1"; }

app "INSERT INTO audit_logs(action) VALUES ('prova') RETURNING action" | grep -qx prova
app "SELECT count(*) FROM users" > /dev/null

falhas=0
while IFS= read -r proibido; do
  if app "$proibido" > /dev/null 2>&1; then
    echo "FALHA: permitido: $proibido"
    falhas=1
  else
    echo "ok    recusado: $proibido"
  fi
done <<'SQL'
DELETE FROM audit_logs
UPDATE audit_logs SET action = 'x'
TRUNCATE audit_logs
DROP TABLE audit_logs
ALTER TABLE audit_logs DISABLE TRIGGER ALL
CREATE TABLE intruso (i int)
SELECT * FROM migrations
CREATE ROLE intruso
SELECT pg_read_file('/etc/passwd')
COPY users TO PROGRAM 'id'
SQL
[ "$falhas" -eq 0 ]
# A fumaça da API roda com este usuário no próximo passo do CI.
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "::add-mask::$senha"
  echo "SENHA_DO_APP=$senha" >> "$GITHUB_ENV"
fi
