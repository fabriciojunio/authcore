#!/usr/bin/env bash
# Sobe Keycloak, serviço e Kong, roda a prova e derruba tudo no final.
# Uso: bash identidade/provar.sh
set -euo pipefail
cd "$(dirname "$0")"

# Senhas novas a cada execução: nada fixo no repositório e nada que sobreviva ao teste.
AUTHCORE_SENHA_ADMIN_KEYCLOAK="$(openssl rand -hex 24)"
AUTHCORE_SENHA_ANA="Ana-$(openssl rand -hex 12)"
AUTHCORE_SENHA_BRUNO="Bruno-$(openssl rand -hex 12)"
AUTHCORE_SEGREDO_OUTRO_SERVICO="$(openssl rand -hex 32)"
export AUTHCORE_SENHA_ADMIN_KEYCLOAK AUTHCORE_SENHA_ANA AUTHCORE_SENHA_BRUNO AUTHCORE_SEGREDO_OUTRO_SERVICO

KEYCLOAK=http://localhost:8180
EMISSOR="$KEYCLOAK/realms/authcore"

derrubar() {
  if [ "${1:-0}" != 0 ]; then docker compose logs --no-color --tail=80 || true; fi
  docker compose down -v --remove-orphans || true
  rm -f kong/kong.yml
}
trap 'derrubar $?' EXIT

# O compose exige o arquivo do Kong desde o início; o conteúdo real vem depois.
: > kong/kong.yml

docker compose up -d keycloak
echo "Esperando o Keycloak..."
for _ in $(seq 1 90); do
  curl -fsS "$EMISSOR/.well-known/openid-configuration" > /dev/null 2>&1 && break
  sleep 2
done
curl -fsS "$EMISSOR/.well-known/openid-configuration" > /dev/null

# A chave pública do realm sai do próprio Keycloak, já no formato que o Kong lê.
python3 - "$EMISSOR" <<'PY'
import json, sys, textwrap, urllib.request
emissor = sys.argv[1]
with urllib.request.urlopen(emissor, timeout=10) as resposta:
    chave = json.load(resposta)["public_key"]
pem = "-----BEGIN PUBLIC KEY-----\n" + "\n".join(textwrap.wrap(chave, 64)) + "\n-----END PUBLIC KEY-----"
modelo = open("kong/kong.modelo.yml", encoding="utf-8").read()
recuo = " " * 10
modelo = modelo.replace("__EMISSOR__", emissor).replace("__CHAVE_PUBLICA__", "\n".join(recuo + linha for linha in pem.splitlines()))
open("kong/kong.yml", "w", encoding="utf-8").write(modelo)
PY

docker compose up -d --build recursos kong
echo "Esperando o serviço..."
for _ in $(seq 1 90); do
  docker compose logs recursos 2>/dev/null | grep -q "Started RecursosAplicacao" && break
  sleep 2
done
docker compose logs recursos | grep -q "Started RecursosAplicacao"
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/relatorios)" = 401 ] && break
  sleep 1
done

python3 prova/prova.py
