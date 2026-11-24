# Chave, segredos, banco, cache e arquivos.

resource "aws_kms_key" "principal" {
  description             = "AuthCore ${var.ambiente}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.chave.json
}

data "aws_iam_policy_document" "chave" {
  statement {
    sid       = "AdministracaoPelaConta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.conta}:root"]
    }
  }
  statement {
    sid       = "GruposDeLogDoProjeto"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.regiao}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values = [
        "arn:aws:logs:${var.regiao}:${local.conta}:log-group:/ecs/${local.nome}",
        "arn:aws:logs:${var.regiao}:${local.conta}:log-group:/vpc/${local.nome}",
        "arn:aws:logs:${var.regiao}:${local.conta}:log-group:aws-waf-logs-${local.nome}",
      ]
    }
  }
  # Sem isto o alarme publica no tópico cifrado e o aviso some em silêncio.
  statement {
    sid       = "AlarmesPublicamNoTopico"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.conta]
    }
  }
}

# Só o contêiner do segredo; o valor é gravado fora do código. A senha do dono do
# banco é do próprio RDS, e a API não a lê: ela entra como authcore_app.
resource "aws_secretsmanager_secret" "api" {
  for_each                = toset(["jwt-access", "jwt-refresh", "encryption-key", "db-app", "redis"])
  name                    = "${local.nome}/${each.value}"
  kms_key_id              = aws_kms_key.principal.arn
  recovery_window_in_days = 30
}

# ----------------------------------------------------------------- banco

resource "aws_db_subnet_group" "dados" {
  name       = local.nome
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_db_parameter_group" "postgres" {
  name   = local.nome
  family = "postgres17"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  # Comando de esquema e de permissão no log do banco: é onde aparece quem tentou
  # mexer na trilha. Comando de dado não, porque levaria dado pessoal.
  parameter {
    name  = "log_statement"
    value = "ddl"
  }
}

# AWS-0176: o token do IAM vale 15 min e o pool do TypeORM não o renova; a senha
# do authcore_app fica no cofre. AWS-0177: ligada em produção, pelo ambiente.
#trivy:ignore:AWS-0176
#trivy:ignore:AWS-0177
resource "aws_db_instance" "postgres" {
  identifier     = local.nome
  engine         = "postgres"
  engine_version = "17"
  instance_class = "db.t4g.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.principal.arn

  db_name                       = "authcore"
  username                      = "authcore_dono"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.principal.arn

  db_subnet_group_name   = aws_db_subnet_group.dados.name
  vpc_security_group_ids = [aws_security_group.grupo["banco"].id]
  parameter_group_name   = aws_db_parameter_group.postgres.name
  publicly_accessible    = false
  multi_az               = local.producao

  backup_retention_period         = 14
  copy_tags_to_snapshot           = true
  deletion_protection             = local.producao
  skip_final_snapshot             = !local.producao
  final_snapshot_identifier       = local.producao ? "${local.nome}-final" : null
  auto_minor_version_upgrade      = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.principal.arn
}

# ----------------------------------------------------------------- cache

resource "aws_elasticache_subnet_group" "dados" {
  name       = local.nome
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.nome
  description                = "Desafio de passkey e lista de tokens revogados"
  engine                     = "valkey"
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = local.producao ? 2 : 1
  automatic_failover_enabled = local.producao
  multi_az_enabled           = local.producao
  subnet_group_name          = aws_elasticache_subnet_group.dados.name
  security_group_ids         = [aws_security_group.grupo["cache"].id]
  port                       = 6379
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.principal.arn
  auth_token                 = var.senha_do_redis
  auth_token_update_strategy = "ROTATE"
  snapshot_retention_limit   = 0 # só guarda dado de minutos; cópia seria risco sem ganho
}

# -------------------------------------------------------------- arquivos

resource "aws_efs_file_system" "uploads" {
  encrypted  = true
  kms_key_id = aws_kms_key.principal.arn
}

resource "aws_efs_mount_target" "uploads" {
  count           = 2
  file_system_id  = aws_efs_file_system.uploads.id
  subnet_id       = aws_subnet.dados[count.index].id
  security_groups = [aws_security_group.grupo["arquivos"].id]
}

# A tarefa só enxerga esta pasta, sempre com o usuário 1001 da imagem.
resource "aws_efs_access_point" "uploads" {
  file_system_id = aws_efs_file_system.uploads.id
  posix_user {
    uid = 1001
    gid = 1001
  }
  root_directory {
    path = "/uploads"
    creation_info {
      owner_uid   = 1001
      owner_gid   = 1001
      permissions = "0750"
    }
  }
}

resource "aws_efs_file_system_policy" "uploads" {
  file_system_id = aws_efs_file_system.uploads.id
  policy         = data.aws_iam_policy_document.uploads.json
}

data "aws_iam_policy_document" "uploads" {
  statement {
    sid       = "SoATarefaDaApiPeloPontoDeAcesso"
    actions   = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"]
    resources = [aws_efs_file_system.uploads.arn]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.tarefa.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "elasticfilesystem:AccessPointArn"
      values   = [aws_efs_access_point.uploads.arn]
    }
  }
  statement {
    sid       = "NuncaSemTls"
    effect    = "Deny"
    actions   = ["*"]
    resources = [aws_efs_file_system.uploads.arn]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
