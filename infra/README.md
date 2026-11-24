# Infraestrutura na AWS

*[Read this in English](README.en.md)*

A API descrita em OpenTofu. **Nada aqui está no ar:** é código testado com provider simulado, sem
conta e sem custo.

```
internet ─443─▶ WAF ▶ ALB (só /api/v1/*) ─3001─▶ 2 tarefas Fargate ─┬─5432─▶ PostgreSQL (2 zonas)
                                                  sem rota para a    ├─6379─▶ Valkey (TLS)
                                                  internet           ├─2049─▶ EFS (uploads)
                                                                     └─443──▶ endpoints privados da AWS
```

## Decisões

**A API não sai para a internet.** Não há NAT Gateway. Quem tomar o contêiner não tem por onde mandar
dado embora nem baixar a segunda etapa do ataque. Os endpoints privados recusam conta de fora, então
também não dá para usar o S3 ou o CloudWatch de outra conta como saída. O custo é que chamada externa
(e-mail, por exemplo) vai precisar de uma saída explícita quando existir.

**A trilha de auditoria não é apagável pela API.** Ela entra no banco como `authcore_app`, que tem
`SELECT` e `INSERT` em `audit_logs` e mais nada. O dono do esquema só roda migração, e a senha dele é
do RDS. [`banco/provar.sh`](aws/banco/provar.sh) tenta dez coisas proibidas num PostgreSQL de verdade,
e a fumaça da API roda com esse usuário, então o CI prova os dois lados: basta e não sobra.

**Nem o log.** Quem escreve é o agente do ECS, com o papel de execução. O papel da API em execução só
alcança a pasta de uploads.

**A borda é lista de permissão.** O padrão do balanceador é 404; só `/api/v1/*` passa. `/health` com
detalhe de dependência e qualquer rota esquecida ficam de fora.

**Duas camadas de limite.** A API limita por IP na memória de cada instância. O WAF limita por todas,
antes de gastar um bcrypt.

**Log do WAF e amostra sem credencial.** `Authorization`, `Cookie` e a consulta saem do log, e a
amostra fica desligada, porque guardaria corpo de login no console.

## O que cada teste prova

`tofu test` roda 21 casos. Cada um foi conferido quebrando a propriedade de propósito: 34 mutações,
todas pegas pelo caso certo.

| Caso | Propriedade |
|---|---|
| `api_sem_caminho_para_a_internet` | sem IP público, sem rota, saída só de grupo para grupo |
| `conversas_permitidas_sao_so_estas` | a lista inteira de quem fala com quem |
| `endpoints_presos_a_conta` | conta de fora recusada dos dois lados |
| `conteiner_endurecido` | sem root, sem capacidade, disco só leitura, por digest, sem shell |
| `segredo_so_pelo_cofre` | cinco segredos no cofre, nenhum em variável |
| `api_entra_no_banco_com_usuario_minimo` | a API não é dona do banco |
| `banco_fechado_e_cifrado` | privado, TLS obrigatório, sem dado pessoal no log |
| `cache_cifrado_nos_dois_lados` | TLS, e desafio de passkey fora de cópia de segurança |
| `uploads_so_pela_api` | EFS recusa montagem sem TLS |
| `borda_com_tls_e_lista_de_permissao` | TLS 1.2 e 1.3, só `/api/v1/*` |
| `waf_na_frente` | bloqueando, não contando; log sem credencial |
| `papeis_minimos` | nenhuma ação curinga, conta de origem nos papéis |
| `deploy_preso_ao_ambiente` | OIDC só do ambiente protegido |
| `log_que_a_api_nao_apaga` | seis meses, cifrado, sobrevive ao `destroy` |
| `deteccao_avisa` | refresh reutilizado e trilha falhando avisam na primeira vez |
| `homologacao_pode_ser_apagada` | menor, não menos segura |
| `recusa_*` | imagem por tag, origem com curinga ou sem TLS, senha curta, ambiente desconhecido |

`backend/tests/unit/deteccao.test.ts` confere que a mensagem procurada pelo alarme ainda é a que o
código escreve: reescrever uma frase desligaria a detecção sem erro nenhum.

```bash
cd infra/aws
tofu init -backend=false && tofu validate && tofu test
trivy config --severity MEDIUM,HIGH,CRITICAL .
```

## Como subir

Precisa de conta, domínio com certificado no ACM e bucket para o estado.

1. `tofu init` com o bucket, `use_lockfile=true` e `encrypt=true`. Ligar a criptografia do estado no
   cliente por `TF_ENCRYPTION`, com chave KMS: a senha do Redis fica nele.
2. `tofu apply -target=aws_ecr_repository.api`, construir `docker/Dockerfile.backend`, enviar e anotar
   o digest.
3. `tofu plan -out=plano`, ler, `tofu apply plano`.
4. Gravar os cinco segredos no Secrets Manager. O `redis` é o mesmo valor de `senha_do_redis`.
5. Por um acesso temporário à sub-rede de dados, com o segredo do dono: rodar as migrações e
   `banco/usuario-da-aplicacao.sql` com a senha do segredo `db-app`.
6. Repetir o SQL do passo 5 a cada tabela nova: permissão não vem sozinha, de propósito.

## Não verificado

- Nenhum `apply` numa conta real. O que depende de comportamento da AWS (política de endpoint com o
  token do ECR, montagem do EFS, nome de métrica do WAF) está conforme a documentação, não provado.
- A imagem com o certificado do RDS não foi construída nesta máquina, que não tem Docker.

## O que ficou de fora

CloudTrail, GuardDuty e Security Hub são da conta, não do projeto, e devem existir antes dele. As
regras do Prometheus pedem um coletor na VPC; aqui a detecção lê o log JSON. Rotação automática dos
segredos JWT exige que a API aceite duas chaves ao mesmo tempo, o que ela ainda não faz.
