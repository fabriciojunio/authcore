# Papéis com o mínimo.

data "aws_iam_policy_document" "assumir" {
  for_each = toset(["ecs-tasks", "vpc-flow-logs"])
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["${each.value}.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.conta]
    }
  }
}

# O agente do ECS: puxa esta imagem, escreve neste log, lê estes segredos.
resource "aws_iam_role" "execucao" {
  name               = "${local.nome}-execucao"
  assume_role_policy = data.aws_iam_policy_document.assumir["ecs-tasks"].json
}

data "aws_iam_policy_document" "execucao" {
  statement {
    sid       = "TokenDoEcr"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "EstaImagem"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [aws_ecr_repository.api.arn]
  }
  statement {
    sid       = "EsteLog"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {
    sid       = "EstesSegredos"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [for s in aws_secretsmanager_secret.api : s.arn]
  }
  statement {
    sid       = "EstaChaveSoPeloCofre"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.principal.arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.regiao}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execucao" {
  role   = aws_iam_role.execucao.id
  policy = data.aws_iam_policy_document.execucao.json
}

# A API em execução: só a pasta de uploads. Não lê segredo, não escreve log.
resource "aws_iam_role" "tarefa" {
  name               = "${local.nome}-tarefa"
  assume_role_policy = data.aws_iam_policy_document.assumir["ecs-tasks"].json
}

data "aws_iam_policy_document" "tarefa" {
  statement {
    sid       = "PastaDeUploads"
    actions   = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"]
    resources = [aws_efs_file_system.uploads.arn]
    condition {
      test     = "StringEquals"
      variable = "elasticfilesystem:AccessPointArn"
      values   = [aws_efs_access_point.uploads.arn]
    }
  }
}

resource "aws_iam_role_policy" "tarefa" {
  role   = aws_iam_role.tarefa.id
  policy = data.aws_iam_policy_document.tarefa.json
}

# ---------------------------------------------------------------- deploy

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Só o ambiente protegido. Branch, fork e pull request não assumem.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repositorio_github}:environment:${var.ambiente}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.nome}-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "TokenDoEcr"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EnviarEstaImagem"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:DescribeImages", "ecr:DescribeImageScanFindings",
    ]
    resources = [aws_ecr_repository.api.arn]
  }
  statement {
    sid       = "EsteServico"
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [aws_ecs_service.api.id]
  }
  statement {
    sid       = "DefinicaoDeTarefa"
    actions   = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"]
    resources = ["*"]
  }
  statement {
    sid       = "SoOsPapeisDaApi"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.execucao.arn, aws_iam_role.tarefa.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "deploy" {
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
