# Operação e detecção

*[Read this in English](operacao.en.md)*

## O que a API emite

| Sinal | Onde | Conteúdo |
|---|---|---|
| Log | stdout, JSON por linha (`LOG_TO_FILE=true` grava também em arquivo) | `correlationId`, `traceId`, rota sem consulta, status, duração. Senha, token, cookie, e-mail e parâmetro de banco nunca, em nenhuma profundidade |
| Métrica | porta própria (`METRICS_PORT`, 9464), fora da borda | RED por rota, e eventos de segurança por motivo. Rótulo só de lista fechada |
| Trace | OTLP, se `OTEL_EXPORTER_OTLP_ENDPOINT` existir | HTTP, Express, Postgres (SQL com marcador) e Redis (só o comando). Sem consulta da URL e sem IP |
| Trilha | tabela `audit_logs` | quem, o quê, quando, de onde |

O `X-Request-ID` da resposta é o `correlationId` do log e o `requestId` do corpo do erro. Ele é
sempre gerado no servidor; o que o cliente manda fica em `clientRequestId`.

O teste `backend/tests/smoke/telemetria.cjs` sobe a API compilada em produção e confere tudo isso,
inclusive que nada sensível sai no log ou no trace.

## Objetivos de serviço

- 99,5% das respostas sem 5xx, em 30 dias, sem contar a sonda de saúde.
- p95 do login até 1,5 s. O bcrypt de custo 12 é cerca de 200 ms de propósito.

## Sondas

| Rota | Responde | Para quem |
|---|---|---|
| `/health/live` | o processo está de pé | reinício do contêiner |
| `/health/ready` | o banco responde em 2 s | balanceador |
| `/health` | estado do banco e do cache | pessoa |

A `live` e a `ready` ficam fora do limite de requisições; a `ready` guarda o resultado por 2 s.
Sem Redis a API degrada e continua pronta: a revogação ainda é conferida no banco.

## Alertas

As regras estão em [`observabilidade/regras.yml`](../observabilidade/regras.yml), com teste em
`regras.teste.yml`. As de detecção levam a técnica do MITRE ATT&CK.

### Erro 5xx
1. `route` e `status` em `authcore_http_requests_total` dizem onde.
2. Filtrar o log por `level=error` e seguir o `traceId`.
3. Erro do cliente não chega aqui: corpo grande é 413, JSON quebrado é 400.

### Login lento
Se só o login está lento, é CPU (bcrypt): conferir se há pulverização de senha ao mesmo tempo. Se
tudo está lento, é banco: ver os spans `pg.query`.

### API fora do ar
Conferir `/health/live` e o motivo da última saída do processo no log.

### Refresh reutilizado
*T1550.001.* A API já revogou todas as sessões da conta.
1. Trilha: `action = 'auth.refresh_reuse'` dá o usuário, o IP e o navegador.
2. Comparar com o login anterior da mesma conta. IP ou navegador diferente é roubo: avisar o dono,
   exigir troca de senha e procurar o mesmo IP em outras contas.
3. Mesmo IP e navegador, repetido: provável defeito do cliente (duas abas renovando juntas).

### Força bruta
*T1110.003.*
1. Trilha, por IP: muitos usuários por IP é pulverização; um usuário é força bruta.
2. Bloquear o IP ou a faixa na borda. O limite por IP da API não segura ataque distribuído.
3. Houve `auth.login` do mesmo IP? Essa conta está comprometida: revogar sessões e avisar.

### Enumeração
*T1589.002.* Quem tem uma lista quer saber quais e-mails têm conta. A resposta e o tempo são iguais
para conta existente, inexistente e bloqueada, então o ataque não deve render; bloquear o IP mesmo
assim, porque é a preparação do próximo.

### Segundo fator
*T1111.* Só chega ao TOTP quem acertou a senha. `totp_replay` é código já usado: alguém o leu em
tempo real (phishing com proxy). Tratar a senha da conta como vazada e oferecer passkey, que é imune.

### Acesso negado
*T1078.* Conta legítima tentando rota acima do papel: conta tomada ou pessoa curiosa. Trilha e log
pelo `userId`.

### Trilha falhando
*T1562.008.* Os eventos continuam na métrica e no log. Conferir o banco (espaço, permissão de
`INSERT` em `audit_logs`) e se houve mudança de permissão não planejada. Enquanto durar, exportar o
log: ele é o registro que resta.

## Privacidade

IP e navegador ficam no log e na trilha para investigar incidente (legítimo interesse, LGPD art. 7º,
IX) e não vão para métrica nem trace. Guardar o log por 30 dias e a trilha por 6 meses cobre a
investigação; quem publica define o prazo no destino do log.
