# Identidade com Keycloak e Kong

*[Read this in English](README.en.md)*

O AuthCore faz a autenticação dentro da própria aplicação. Esta pasta mostra o outro jeito, o
que empresa maior costuma usar: um provedor de identidade separado (Keycloak), um gateway na
borda (Kong) e serviços que só confiam no token.

```
navegador ── login (Authorization Code + PKCE) ──> Keycloak :8180
    │
    └── Bearer token ──> Kong :8000 ──> recursos (Spring Boot, sem porta publicada)
                          │                 │
                          │                 └─ confere de novo: assinatura, emissor,
                          │                    audiência e papel "analista"
                          └─ confere assinatura e validade, limita 20 req/min por IP
```

## O que tem aqui

| Pasta | O quê |
|---|---|
| `keycloak/realm-authcore.json` | realm com o cliente público `authcore-web` (PKCE S256 obrigatório, sem fluxo implícito nem login direto por senha, redirect exato), mapeador de audiência, proteção contra força bruta e token de 5 min |
| `kong/kong.modelo.yml` | Kong sem banco e sem API de administração: plugin `jwt` com RS256, limite por IP, limite de tamanho do corpo |
| `recursos/` | serviço Spring Boot 4 que valida o token de novo. Não confia no Kong |
| `prova/prova.py` | login PKCE pelo formulário do Keycloak e os ataques, só com a biblioteca padrão do Python |

As senhas da ana, do bruno e do cliente `outro-servico` não estão no repositório: o
`provar.sh` gera valores aleatórios a cada execução e o Keycloak lê do ambiente.

## Como rodar

Precisa de Docker, Python 3 e OpenSSL.

```bash
bash identidade/provar.sh      # sobe tudo, roda a prova e derruba no final
cd identidade/recursos && mvn verify   # só os testes do serviço
```

A prova roda na CI a cada push, no job "Identidade (Keycloak + Kong)".

## O que a prova confere

- pedido de autorização sem PKCE é recusado
- `redirect_uri` fora da lista não recebe código
- código trocado sem `code_verifier`, ou com o de outro fluxo, é recusado
- o mesmo código não serve duas vezes
- login direto por senha (password grant) está desligado
- sem token, o Kong responde 401
- token com o conteúdo alterado ou com `alg: none` é barrado no Kong
- usuário sem o papel `analista` recebe 403 do serviço
- token válido do mesmo Keycloak, mas emitido para outro serviço, é recusado pela audiência
- o Kong corta o excesso com 429
- o serviço não tem porta publicada

No serviço, `ValidacaoDoTokenTest` assina tokens de verdade com uma chave RSA própria e um JWKS
local, e confere emissor errado, audiência errada, token expirado, outra chave com o mesmo
`kid` e `alg: none`.

## AuthCore ou Keycloak?

| | AuthCore (o resto deste repositório) | Keycloak |
|---|---|---|
| Onde fica a senha | no banco da aplicação | no provedor de identidade |
| Token | HS256, emitido e conferido pela mesma API | RS256, emitido por um e conferido por muitos com a chave pública |
| Vários sistemas com um login só | não | sim (SSO, OIDC, SAML) |
| MFA e passkeys | implementados aqui, com teste | prontos, configurados no realm |
| Custo de operar | uma API a mais | mais um serviço crítico, com banco, atualização e backup próprios |
| Quando usar | um produto só, regra de login muito própria, time pequeno | vários serviços ou sistemas, login corporativo, auditoria central |

Na prática: escrever a autenticação, como no AuthCore, ensina onde cada falha mora. Em produção
com mais de um serviço, eu usaria o Keycloak (ou outro provedor pronto) e deixaria cada serviço
apenas validar o token, como faz o `recursos`.

## Limites

É ambiente de laboratório: Keycloak em `start-dev`, sem TLS e com banco em memória. Em produção
seriam necessários TLS em tudo, Keycloak em modo `start` com Postgres, chave de assinatura com
rotação e o Kong lendo a chave pelo JWKS em vez de um arquivo gerado.
