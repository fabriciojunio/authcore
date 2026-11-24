-- Usuário com que a API entra no banco. Rodar como dono do esquema, depois das
-- migrações e de novo a cada tabela nova:
--
--   psql -v ON_ERROR_STOP=1 -v senha="$SENHA_DO_COFRE" -f usuario-da-aplicacao.sql
--
-- O dono fica só para migração. Quem tomar a API não consegue apagar a trilha de
-- auditoria, criar tabela nem mudar permissão: ele tem o que este arquivo dá.

SELECT format('CREATE ROLE authcore_app LOGIN PASSWORD %L', :'senha')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authcore_app') \gexec
SELECT format('ALTER ROLE authcore_app PASSWORD %L', :'senha') \gexec
ALTER ROLE authcore_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 40;
ALTER ROLE authcore_app SET statement_timeout = '30s';
ALTER ROLE authcore_app SET idle_in_transaction_session_timeout = '60s';

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO authcore_app', current_database()) \gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO authcore_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authcore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, products, passkeys TO authcore_app;
-- Trilha só de acréscimo. SELECT é do RETURNING e da página de auditoria.
GRANT SELECT, INSERT ON audit_logs TO authcore_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authcore_app;
