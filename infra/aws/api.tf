# Imagem, tarefa e serviço.

resource "aws_ecr_repository" "api" {
  name                 = local.nome
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.principal.arn
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }
      action       = { type = "expire" }
    }]
  })
}

# Quem escreve é o agente do ECS com o papel de execução, que a API não alcança.
# Nem tomando o contêiner dá para apagar o que já saiu.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.nome}"
  retention_in_days = 180
  kms_key_id        = aws_kms_key.principal.arn
  skip_destroy      = local.producao
}

resource "aws_ecs_cluster" "principal" {
  name = local.nome
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

locals {
  segredos = {
    JWT_ACCESS_SECRET  = "jwt-access"
    JWT_REFRESH_SECRET = "jwt-refresh"
    ENCRYPTION_KEY     = "encryption-key"
    DB_PASSWORD        = "db-app"
    REDIS_PASSWORD     = "redis"
    SMTP_PASSWORD      = "smtp"
  }

  ambiente = {
    NODE_ENV           = "production"
    APP_NAME           = "AuthCore"
    PORT               = "3001"
    DB_HOST            = aws_db_instance.postgres.address
    DB_PORT            = "5432"
    DB_NAME            = "authcore"
    DB_USER            = "authcore_app"
    DB_SSL             = "true"
    REDIS_HOST         = aws_elasticache_replication_group.redis.primary_endpoint_address
    REDIS_TLS          = "true"
    ALLOWED_ORIGINS    = var.origem_do_front
    WEBAUTHN_ORIGIN    = var.origem_do_front
    UPLOAD_PATH        = "/app/uploads"
    ALLOWED_FILE_TYPES = "image/jpeg,image/png,image/webp"
    # O envio de e-mail ainda não existe na API, e a sub-rede não tem saída. A
    # senha do SMTP fica no cofre mesmo assim: valor fixo de senha não entra no código.
    SMTP_HOST  = "indisponivel.invalid"
    SMTP_USER  = "indisponivel"
    EMAIL_FROM = "naoresponda@${replace(var.origem_do_front, "https://", "")}"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = local.nome
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn

  container_definitions = jsonencode([{
    name                   = "api"
    image                  = "${aws_ecr_repository.api.repository_url}@${var.imagem_digest}"
    essential              = true
    user                   = "1001:1001"
    privileged             = false
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { drop = ["ALL"] } }
    portMappings           = [{ containerPort = 3001, protocol = "tcp" }]
    environment            = [for k, v in local.ambiente : { name = k, value = v }]
    secrets = [
      for k, v in local.segredos : { name = k, valueFrom = aws_secretsmanager_secret.api[v].arn }
    ]
    mountPoints = [
      { sourceVolume = "tmp", containerPath = "/tmp", readOnly = false },
      { sourceVolume = "uploads", containerPath = "/app/uploads", readOnly = false },
    ]
    stopTimeout = 35 # a API encerra em até 30 s
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.regiao
        awslogs-stream-prefix = "api"
      }
    }
  }])

  volume {
    name = "tmp"
  }
  volume {
    name = "uploads"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.uploads.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.uploads.id
        iam             = "ENABLED"
      }
    }
  }
}

resource "aws_ecs_service" "api" {
  name                   = local.nome
  cluster                = aws_ecs_cluster.principal.id
  task_definition        = aws_ecs_task_definition.api.arn
  desired_count          = 2
  launch_type            = "FARGATE"
  enable_execute_command = false

  network_configuration {
    subnets          = aws_subnet.api[*].id
    security_groups  = [aws_security_group.grupo["api"].id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # A imagem é trocada pelo deploy; sem isto o próximo apply a desfaria.
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]
}
