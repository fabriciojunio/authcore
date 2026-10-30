"""Prova do conjunto Keycloak + Kong + serviço Spring, de fora, como um cliente.

Faz o login Authorization Code com PKCE pelo formulário do Keycloak, do jeito que
o navegador faria, e depois tenta os ataques de sempre contra o Kong. Só usa a
biblioteca padrão do Python. As senhas vêm do ambiente, definidas pelo provar.sh.
"""

import base64
import hashlib
import html
import http.cookiejar
import json
import os
import re
import secrets
import socket
import urllib.error
import urllib.parse
import urllib.request

KEYCLOAK = "http://localhost:8180/realms/authcore/protocol/openid-connect"
KONG = "http://localhost:8000/api/relatorios"
CLIENTE = "authcore-web"
RETORNO = "http://localhost:5173/callback"

falhas = []


def conferir(condicao, descricao):
    print(("ok    " if condicao else "FALHOU ") + descricao)
    if not condicao:
        falhas.append(descricao)


class SemRedirecionar(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def navegador():
    cookies = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies), SemRedirecionar())


def chamar(abridor, url, dados=None, cabecalhos=None):
    corpo = urllib.parse.urlencode(dados).encode() if dados is not None else None
    pedido = urllib.request.Request(url, data=corpo, headers=cabecalhos or {})
    try:
        with abridor.open(pedido, timeout=15) as resposta:
            return resposta.status, dict(resposta.headers), resposta.read().decode()
    except urllib.error.HTTPError as erro:
        return erro.code, dict(erro.headers), erro.read().decode()


def b64url(dados):
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


def autorizar(usuario, senha, desafio=True, retorno=RETORNO):
    """Abre a tela de login, envia usuário e senha e devolve (status, Location, verificador)."""
    verificador = b64url(secrets.token_bytes(32))
    estado = b64url(secrets.token_bytes(16))
    parametros = {"client_id": CLIENTE, "redirect_uri": retorno, "response_type": "code",
                  "scope": "openid", "state": estado}
    if desafio:
        parametros["code_challenge"] = b64url(hashlib.sha256(verificador.encode()).digest())
        parametros["code_challenge_method"] = "S256"
    abridor = navegador()
    status, cabecalhos, pagina = chamar(abridor, f"{KEYCLOAK}/auth?{urllib.parse.urlencode(parametros)}")
    if status != 200:
        return status, cabecalhos.get("Location", ""), verificador
    acao = re.search(r'<form[^>]*id="kc-form-login"[^>]*>', pagina)
    destino = html.unescape(re.search(r'action="([^"]+)"', acao.group(0)).group(1))
    status, cabecalhos, _ = chamar(abridor, destino, {"username": usuario, "password": senha, "credentialId": ""})
    local = cabecalhos.get("Location", "")
    consulta = urllib.parse.parse_qs(urllib.parse.urlparse(local).query)
    if consulta.get("state", [estado])[0] != estado:
        raise AssertionError("state devolvido diferente do enviado")
    return status, local, verificador


def codigo(local):
    return urllib.parse.parse_qs(urllib.parse.urlparse(local).query)["code"][0]


def trocar(cod, verificador=None):
    dados = {"grant_type": "authorization_code", "client_id": CLIENTE, "code": cod, "redirect_uri": RETORNO}
    if verificador:
        dados["code_verifier"] = verificador
    status, _, corpo = chamar(navegador(), f"{KEYCLOAK}/token", dados)
    return status, json.loads(corpo) if corpo else {}


def login(usuario, senha):
    status, local, verificador = autorizar(usuario, senha)
    assert status == 302 and "code=" in local, f"login de {usuario} não devolveu código: {status}"
    status, tokens = trocar(codigo(local), verificador)
    assert status == 200, f"troca do código de {usuario} falhou: {status} {tokens}"
    return tokens["access_token"]


def relatorios(token=None):
    cabecalhos = {"Authorization": f"Bearer {token}"} if token else {}
    return chamar(navegador(), KONG, cabecalhos=cabecalhos)


def payload(token):
    parte = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(parte + "=" * (-len(parte) % 4)))


def main():
    ana, bruno = os.environ["AUTHCORE_SENHA_ANA"], os.environ["AUTHCORE_SENHA_BRUNO"]

    print("\nKeycloak: o fluxo de autorização")
    status, local, _ = autorizar("ana", ana, desafio=False)
    conferir("error=invalid_request" in local or status == 400, "pedido de autorização sem PKCE é recusado")

    status, local, _ = autorizar("ana", ana, retorno="https://atacante.example/callback")
    conferir(status == 400 and "code=" not in local, "redirect_uri fora da lista não recebe código")

    status, local, _ = autorizar("ana", "senha-errada")
    conferir("code=" not in local, "senha errada não gera código")

    status, local, verificador = autorizar("ana", ana)
    status_sem, _ = trocar(codigo(local))
    conferir(status_sem == 400, "código trocado sem code_verifier é recusado")

    status, local, verificador = autorizar("ana", ana)
    status_errado, _ = trocar(codigo(local), b64url(secrets.token_bytes(32)))
    conferir(status_errado == 400, "código trocado com code_verifier de outro fluxo é recusado")

    status, local, verificador = autorizar("ana", ana)
    cod = codigo(local)
    status_ok, tokens = trocar(cod, verificador)
    conferir(status_ok == 200 and "access_token" in tokens, "Authorization Code com PKCE S256 emite o token")
    status_reuso, _ = trocar(cod, verificador)
    conferir(status_reuso == 400, "o mesmo código não serve duas vezes")

    status, _, corpo = chamar(navegador(), f"{KEYCLOAK}/token",
                              {"grant_type": "password", "client_id": CLIENTE, "username": "ana", "password": ana})
    conferir(status in (400, 401), "login direto por senha (password grant) está desligado")

    token_ana = tokens["access_token"]
    dados = payload(token_ana)
    audiencia = dados["aud"] if isinstance(dados["aud"], list) else [dados["aud"]]
    conferir("authcore-recursos" in audiencia, "o token da ana tem a audiência do serviço")
    conferir(dados["exp"] - dados["iat"] <= 300, "o token de acesso vale no máximo 5 minutos")

    print("\nKong e serviço: quem passa")
    status, _, _ = relatorios()
    conferir(status == 401, "sem token, o Kong responde 401")

    status, _, corpo = relatorios(token_ana)
    conferir(status == 200 and json.loads(corpo)["solicitante"] == dados["sub"],
             "com o token da ana, os relatórios chegam com o id dela")

    cabecalho, carga, assinatura = token_ana.split(".")
    adulterado = dict(dados, realm_access={"roles": ["analista", "admin"]}, sub="outra-pessoa")
    forjado = f"{cabecalho}.{b64url(json.dumps(adulterado).encode())}.{assinatura}"
    status, _, _ = relatorios(forjado)
    conferir(status == 401, "token com o conteúdo alterado é barrado pelo Kong")

    sem_assinatura = f"{b64url(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())}.{carga}."
    status, _, _ = relatorios(sem_assinatura)
    conferir(status == 401, "token com alg none é barrado pelo Kong")

    status, _, _ = relatorios(login("bruno", bruno))
    conferir(status == 403, "bruno, sem o papel de analista, recebe 403 do serviço")

    status, _, corpo = chamar(navegador(), f"{KEYCLOAK}/token", {
        "grant_type": "client_credentials", "client_id": "outro-servico",
        "client_secret": os.environ["AUTHCORE_SEGREDO_OUTRO_SERVICO"]})
    token_outro = json.loads(corpo)["access_token"]
    status, _, _ = relatorios(token_outro)
    conferir(status == 401, "token válido do mesmo Keycloak, mas de outra audiência, é recusado pelo serviço")

    print("\nKong: limite e exposição")
    codigos = [relatorios(token_ana)[0] for _ in range(45)]
    conferir(429 in codigos, f"o Kong corta o excesso com 429 ({codigos.count(429)} de 45 cortadas)")

    with socket.socket() as conexao:
        conexao.settimeout(2)
        fechado = conexao.connect_ex(("127.0.0.1", 8080)) != 0
    conferir(fechado, "o serviço não tem porta publicada; só se chega a ele pelo Kong")

    print()
    if falhas:
        raise SystemExit(f"{len(falhas)} verificação(ões) falharam")
    print("Todas as verificações passaram.")


if __name__ == "__main__":
    main()
