# Provider simulado: sem conta, sem rede, sem custo. Cada run confere o que não
# pode regredir.

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["sa-east-1a", "sa-east-1b", "sa-east-1c"] }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:sa-east-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:sa-east-1:123456789012:alertas" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/papel" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:sa-east-1:123456789012:loadbalancer/app/api/0123456789abcdef"
      arn_suffix = "app/api/0123456789abcdef"
    }
  }
  mock_resource "aws_lb_target_group" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:sa-east-1:123456789012:targetgroup/api/0123456789abcdef"
      arn_suffix = "targetgroup/api/0123456789abcdef"
    }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:sa-east-1:123456789012:listener/app/api/0123456789abcdef/0123456789abcdef" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:sa-east-1:123456789012:regional/webacl/authcore/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:sa-east-1:123456789012:log-group:grupo" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:sa-east-1:123456789012:repository/authcore"
      repository_url = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/authcore"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:authcore-AbCdEf" }
  }
  mock_resource "aws_efs_file_system" {
    defaults = { arn = "arn:aws:elasticfilesystem:sa-east-1:123456789012:file-system/fs-0123456789abcdef0" }
  }
  mock_resource "aws_efs_access_point" {
    defaults = { arn = "arn:aws:elasticfilesystem:sa-east-1:123456789012:access-point/fsap-0123456789abcdef0" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { id = "arn:aws:ecs:sa-east-1:123456789012:cluster/authcore" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:sa-east-1:123456789012:task-definition/authcore:1" }
  }
  mock_resource "aws_ecs_service" {
    defaults = { id = "arn:aws:ecs:sa-east-1:123456789012:service/authcore/authcore" }
  }
  mock_resource "aws_vpc_endpoint" {
    defaults = { prefix_list_id = "pl-0123456789abcdef0" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      address            = "banco.interno"
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:dono", kms_key_id = "", secret_status = "active" }]
    }
  }
}

variables {
  ambiente        = "producao"
  imagem_digest   = "sha256:0000000000000000000000000000000000000000000000000000000000000000"
  certificado_arn = "arn:aws:acm:sa-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  origem_do_front = "https://authcore.example.com"
  senha_do_redis  = "senhaDeTesteComTrintaEDoisCaracteres01"
  email_de_alerta = "alertas@example.com"
}

run "api_sem_caminho_para_a_internet" {
  command = apply
  assert {
    condition     = aws_ecs_service.api.network_configuration[0].assign_public_ip == false
    error_message = "a tarefa não pode ter IP público"
  }
  assert {
    condition     = toset(aws_ecs_service.api.network_configuration[0].subnets) == toset(aws_subnet.api[*].id)
    error_message = "a tarefa precisa ficar na sub-rede interna"
  }
  assert {
    condition     = length(aws_route_table.interna.route) == 0
    error_message = "a tabela interna não pode ter rota para fora"
  }
  assert {
    condition     = alltrue([for r in aws_vpc_security_group_egress_rule.saida : r.cidr_ipv4 == null])
    error_message = "nenhuma saída por faixa de IP: só de grupo para grupo"
  }
}

run "conversas_permitidas_sao_so_estas" {
  command = apply
  assert {
    condition     = toset(keys(aws_vpc_security_group_ingress_rule.entrada)) == toset(["alb_api", "api_banco", "api_cache", "api_arquivos", "api_endpoints"])
    error_message = "conversa nova na rede precisa mudar este teste de propósito"
  }
  assert {
    condition     = toset(keys(aws_vpc_security_group_ingress_rule.internet)) == toset(["80", "443"])
    error_message = "da internet só 80 e 443, no balanceador"
  }
  assert {
    condition     = length(aws_default_security_group.vazio.ingress) == 0
    error_message = "o grupo padrão da VPC precisa ficar vazio"
  }
}

run "endpoints_presos_a_conta" {
  command = apply
  assert {
    condition = length([
      for c in data.aws_iam_policy_document.so_esta_conta.statement[0].condition : c
      if contains(["aws:PrincipalAccount", "aws:ResourceAccount"], c.variable) && toset(c.values) == toset(["123456789012"])
    ]) == 2
    error_message = "o endpoint precisa recusar conta de fora, dos dois lados"
  }
  assert {
    condition     = toset(data.aws_iam_policy_document.so_camadas_do_ecr.statement[0].actions) == toset(["s3:GetObject"])
    error_message = "pelo endpoint do S3 só se lê camada do ECR"
  }
}

run "conteiner_endurecido" {
  command = apply
  assert {
    condition = alltrue([
      for c in jsondecode(aws_ecs_task_definition.api.container_definitions) :
      c.readonlyRootFilesystem && !c.privileged && c.user == "1001:1001" && c.linuxParameters.capabilities.drop == ["ALL"]
    ])
    error_message = "contêiner sem root, sem capacidade e com disco só leitura"
  }
  assert {
    condition     = strcontains(jsondecode(aws_ecs_task_definition.api.container_definitions)[0].image, "@sha256:")
    error_message = "imagem por digest"
  }
  assert {
    condition     = aws_ecs_service.api.enable_execute_command == false
    error_message = "ECS Exec abre shell em produção"
  }
}

run "segredo_so_pelo_cofre" {
  command = apply
  assert {
    condition = toset([for s in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets : s.name]) == toset([
      "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY", "DB_PASSWORD", "REDIS_PASSWORD",
    ])
    error_message = "os cinco segredos precisam vir do Secrets Manager"
  }
  assert {
    condition = alltrue([
      for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment :
      !can(regex("SECRET|_KEY$|^DB_PASSWORD$|^REDIS_PASSWORD$", e.name))
    ])
    error_message = "segredo em variável comum aparece na definição da tarefa"
  }
  assert {
    condition     = !strcontains(aws_ecs_task_definition.api.container_definitions, var.senha_do_redis)
    error_message = "a senha do Redis não pode aparecer na tarefa"
  }
}

run "api_entra_no_banco_com_usuario_minimo" {
  command = apply
  assert {
    condition = anytrue([
      for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment :
      e.name == "DB_USER" && e.value == "authcore_app"
    ])
    error_message = "a API não pode entrar como dono do banco: ele apaga a trilha de auditoria"
  }
  assert {
    condition     = aws_db_instance.postgres.manage_master_user_password == true && aws_db_instance.postgres.username != "authcore_app"
    error_message = "a senha do dono é do RDS e não é a da API"
  }
}

run "banco_fechado_e_cifrado" {
  command = apply
  assert {
    condition     = !aws_db_instance.postgres.publicly_accessible && aws_db_instance.postgres.storage_encrypted
    error_message = "banco privado e cifrado"
  }
  assert {
    condition     = anytrue([for p in aws_db_parameter_group.postgres.parameter : p.name == "rds.force_ssl" && p.value == "1"])
    error_message = "o banco precisa recusar conexão sem TLS"
  }
  assert {
    condition     = aws_db_instance.postgres.deletion_protection && aws_db_instance.postgres.multi_az && aws_db_instance.postgres.backup_retention_period >= 7
    error_message = "produção com proteção, duas zonas e cópia de segurança"
  }
  assert {
    condition     = anytrue([for p in aws_db_parameter_group.postgres.parameter : p.name == "log_statement" && p.value == "ddl"])
    error_message = "log de comando de dado levaria dado pessoal; só esquema"
  }
}

run "cache_cifrado_nos_dois_lados" {
  command = apply
  assert {
    condition     = tobool(aws_elasticache_replication_group.redis.transit_encryption_enabled) && tobool(aws_elasticache_replication_group.redis.at_rest_encryption_enabled)
    error_message = "Redis com TLS e cifrado"
  }
  assert {
    condition     = aws_elasticache_replication_group.redis.snapshot_retention_limit == 0
    error_message = "desafio de passkey não pode ir para cópia de segurança"
  }
}

run "uploads_so_pela_api" {
  command = apply
  assert {
    condition     = aws_ecs_task_definition.api.volume != null && aws_efs_file_system.uploads.encrypted
    error_message = "arquivos cifrados"
  }
  assert {
    condition = anytrue([
      for s in data.aws_iam_policy_document.uploads.statement : s.sid == "NuncaSemTls" && s.effect == "Deny"
    ])
    error_message = "o EFS precisa recusar montagem sem TLS"
  }
}

run "borda_com_tls_e_lista_de_permissao" {
  command = apply
  assert {
    condition     = aws_lb_listener.https.ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06"
    error_message = "só TLS 1.2 e 1.3"
  }
  assert {
    condition     = aws_lb_listener.https.default_action[0].type == "fixed-response"
    error_message = "o padrão da borda é recusar"
  }
  assert {
    condition     = toset(one(one(aws_lb_listener_rule.api.condition[*]).path_pattern[*]).values) == toset(["/api/v1/*"])
    error_message = "só /api/v1 vai para a internet: /health e /metrics não"
  }
  assert {
    condition     = aws_lb_listener.http.default_action[0].redirect[0].protocol == "HTTPS"
    error_message = "a porta 80 só redireciona"
  }
  assert {
    condition     = aws_lb.api.drop_invalid_header_fields && aws_lb.api.desync_mitigation_mode == "strictest"
    error_message = "a borda precisa barrar contrabando de requisição"
  }
  assert {
    condition     = aws_lb_target_group.api.health_check[0].path == "/health/ready"
    error_message = "o balanceador confere prontidão, que depende do banco"
  }
}

run "waf_na_frente" {
  command = apply
  assert {
    condition     = aws_wafv2_web_acl_association.borda.resource_arn == aws_lb.api.arn
    error_message = "o WAF precisa estar no balanceador"
  }
  assert {
    condition = anytrue([
      for r in aws_wafv2_web_acl.borda.rule : r.name == "limite-de-autenticacao" && length(r.action[0].block) == 1
    ])
    error_message = "o limite de autenticação precisa bloquear, não só contar"
  }
  assert {
    condition = length(setintersection([for r in aws_wafv2_web_acl.borda.rule : r.name], [
      "AWSManagedRulesCommonRuleSet", "AWSManagedRulesKnownBadInputsRuleSet",
      "AWSManagedRulesSQLiRuleSet", "AWSManagedRulesAmazonIpReputationList",
    ])) == 4
    error_message = "faltam grupos de regra da AWS"
  }
  assert {
    condition     = alltrue([for r in aws_wafv2_web_acl.borda.rule : length(r.override_action) == 0 || length(r.override_action[0].none) == 1])
    error_message = "grupo de regra em modo contagem não protege"
  }
  assert {
    condition     = length(aws_wafv2_web_acl_logging_configuration.borda.redacted_fields) == 3
    error_message = "o log do WAF não pode levar token, cookie nem consulta"
  }
}

run "papeis_minimos" {
  command = apply
  assert {
    condition = alltrue(flatten([
      for doc in [data.aws_iam_policy_document.deploy, data.aws_iam_policy_document.execucao, data.aws_iam_policy_document.tarefa] : [
        for s in doc.statement : [for a in s.actions : !strcontains(a, "*")]
      ]
    ]))
    error_message = "nenhum papel com ação curinga"
  }
  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.tarefa.statement : [for a in s.actions : startswith(a, "elasticfilesystem:")]
    ]))
    error_message = "a API em execução só mexe na pasta de uploads: sem log, sem segredo"
  }
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.execucao.statement : s.sid == "TokenDoEcr" || !contains(s.resources, "*")
    ])
    error_message = "recurso curinga só no token do ECR, que não aceita outro"
  }
  assert {
    condition     = alltrue([for d in data.aws_iam_policy_document.assumir : length(d.statement[0].condition) == 1])
    error_message = "papel de serviço precisa da conta de origem (confused deputy)"
  }
}

run "deploy_preso_ao_ambiente" {
  command = apply
  assert {
    condition = anytrue([
      for c in data.aws_iam_policy_document.github.statement[0].condition :
      c.test == "StringEquals" && c.variable == "token.actions.githubusercontent.com:sub"
      && toset(c.values) == toset(["repo:fabriciojunio/authcore:environment:producao"])
    ])
    error_message = "só o ambiente protegido assume o papel, sem curinga"
  }
}

run "log_que_a_api_nao_apaga" {
  command = apply
  assert {
    condition     = aws_cloudwatch_log_group.api.retention_in_days >= 180 && aws_cloudwatch_log_group.api.skip_destroy
    error_message = "o log de produção fica seis meses e sobrevive ao destroy"
  }
  assert {
    condition     = alltrue([for g in [aws_cloudwatch_log_group.api, aws_cloudwatch_log_group.fluxo, aws_cloudwatch_log_group.waf] : g.kms_key_id != null])
    error_message = "todo log cifrado com a chave do projeto"
  }
  assert {
    condition     = aws_flow_log.vpc.traffic_type == "ALL"
    error_message = "registro de fluxo aceito e recusado"
  }
}

run "deteccao_avisa" {
  command = apply
  assert {
    condition     = aws_cloudwatch_metric_alarm.deteccao["refresh-reutilizado"].threshold == 0 && aws_cloudwatch_metric_alarm.deteccao["trilha-falhando"].threshold == 0
    error_message = "estes dois avisam na primeira ocorrência"
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_metric_alarm.deteccao : length(a.alarm_actions) == 1])
    error_message = "alarme sem destino não avisa ninguém"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.sem_tarefa.treat_missing_data == "breaching"
    error_message = "métrica que sumiu também é queda"
  }
  assert {
    condition     = aws_kms_key.principal.enable_key_rotation && aws_sns_topic.alertas.kms_master_key_id == aws_kms_key.principal.arn
    error_message = "chave com rotação e tópico cifrado com ela"
  }
}

run "homologacao_pode_ser_apagada" {
  command = apply
  variables {
    ambiente = "homologacao"
  }
  assert {
    condition     = !aws_db_instance.postgres.deletion_protection && !aws_lb.api.enable_deletion_protection && !aws_db_instance.postgres.multi_az
    error_message = "homologação não paga por alta disponibilidade"
  }
  assert {
    condition     = aws_db_instance.postgres.storage_encrypted && !aws_db_instance.postgres.publicly_accessible
    error_message = "homologação é menor, não menos segura"
  }
}

run "recusa_imagem_por_tag" {
  command = plan
  variables {
    imagem_digest = "latest"
  }
  expect_failures = [var.imagem_digest]
}

run "recusa_origem_com_curinga" {
  command = plan
  variables {
    origem_do_front = "https://*.example.com"
  }
  expect_failures = [var.origem_do_front]
}

run "recusa_origem_sem_tls" {
  command = plan
  variables {
    origem_do_front = "http://authcore.example.com"
  }
  expect_failures = [var.origem_do_front]
}

run "recusa_senha_curta_do_redis" {
  command = plan
  variables {
    senha_do_redis = "curta"
  }
  expect_failures = [var.senha_do_redis]
}

run "recusa_ambiente_desconhecido" {
  command = plan
  variables {
    ambiente = "dev"
  }
  expect_failures = [var.ambiente]
}
