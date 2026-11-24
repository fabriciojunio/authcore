# Três camadas em duas zonas:
#   publica   só o balanceador
#   api       tarefas, sem rota para a internet
#   dados     banco, cache e arquivos, sem rota para a internet
#
# Não há NAT Gateway: a API não chama ninguém de fora, então não tem por onde
# mandar dado embora nem baixar a segunda etapa de um ataque. Ela fala com a AWS
# por endpoints privados.
#
# A AWS só aceita ASCII na descrição de grupo e de regra de segurança.

resource "aws_vpc" "principal" {
  cidr_block           = "10.50.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = local.nome }
}

# O grupo padrão vem liberado entre os próprios membros; fica vazio.
resource "aws_default_security_group" "vazio" {
  vpc_id = aws_vpc.principal.id
}

resource "aws_internet_gateway" "borda" {
  vpc_id = aws_vpc.principal.id
}

resource "aws_subnet" "publica" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet("10.50.0.0/16", 8, count.index)
  availability_zone = local.zonas[count.index]
}

resource "aws_subnet" "api" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet("10.50.0.0/16", 8, 10 + count.index)
  availability_zone = local.zonas[count.index]
}

resource "aws_subnet" "dados" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet("10.50.0.0/16", 8, 20 + count.index)
  availability_zone = local.zonas[count.index]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.borda.id
  }
}

# Sem rota nenhuma além da local e do endpoint do S3.
resource "aws_route_table" "interna" {
  vpc_id = aws_vpc.principal.id
}

resource "aws_route_table_association" "publica" {
  count          = 2
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table_association" "api" {
  count          = 2
  subnet_id      = aws_subnet.api[count.index].id
  route_table_id = aws_route_table.interna.id
}

resource "aws_route_table_association" "dados" {
  count          = 2
  subnet_id      = aws_subnet.dados[count.index].id
  route_table_id = aws_route_table.interna.id
}

# ---------------------------------------------------------------- grupos

locals {
  grupos = {
    alb       = "Balanceador"
    api       = "Tarefas da API"
    banco     = "PostgreSQL"
    cache     = "Redis"
    arquivos  = "EFS dos uploads"
    endpoints = "Endpoints privados da AWS"
  }

  # Toda conversa permitida na rede, uma por linha. O que não está aqui não passa.
  conversas = {
    alb_api       = { de = "alb", para = "api", porta = 3001 }
    api_banco     = { de = "api", para = "banco", porta = 5432 }
    api_cache     = { de = "api", para = "cache", porta = 6379 }
    api_arquivos  = { de = "api", para = "arquivos", porta = 2049 }
    api_endpoints = { de = "api", para = "endpoints", porta = 443 }
  }
}

resource "aws_security_group" "grupo" {
  for_each    = local.grupos
  name        = "${local.nome}-${each.key}"
  description = each.value
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_egress_rule" "saida" {
  for_each                     = local.conversas
  security_group_id            = aws_security_group.grupo[each.value.de].id
  referenced_security_group_id = aws_security_group.grupo[each.value.para].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.porta
  to_port                      = each.value.porta
  description                  = "${each.value.de} para ${each.value.para}"
}

resource "aws_vpc_security_group_ingress_rule" "entrada" {
  for_each                     = local.conversas
  security_group_id            = aws_security_group.grupo[each.value.para].id
  referenced_security_group_id = aws_security_group.grupo[each.value.de].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.porta
  to_port                      = each.value.porta
  description                  = "${each.value.de} para ${each.value.para}"
}

# As camadas da imagem no ECR saem do S3, pelo endpoint de gateway.
resource "aws_vpc_security_group_egress_rule" "api_s3" {
  security_group_id = aws_security_group.grupo["api"].id
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "api para o S3 das camadas do ECR"
}

resource "aws_vpc_security_group_ingress_rule" "internet" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.grupo["alb"].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  description       = "internet para o balanceador"
}

# ------------------------------------------------------------- endpoints

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(["ecr.api", "ecr.dkr", "logs", "secretsmanager"])
  vpc_id              = aws_vpc.principal.id
  service_name        = "com.amazonaws.${var.regiao}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.api[*].id
  security_group_ids  = [aws_security_group.grupo["endpoints"].id]
  private_dns_enabled = true
  policy              = data.aws_iam_policy_document.so_esta_conta.json
}

# Sem isto, uma tarefa tomada usaria o endpoint para gravar em conta alheia.
data "aws_iam_policy_document" "so_esta_conta" {
  statement {
    actions   = ["*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalAccount"
      values   = [local.conta]
    }
    # IfExists: pedir o token do ECR não tem recurso, e a chave não vem.
    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:ResourceAccount"
      values   = [local.conta]
    }
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${var.regiao}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.interna.id]
  policy            = data.aws_iam_policy_document.so_camadas_do_ecr.json
}

# Só leitura, e só do bucket em que a AWS guarda as camadas do ECR.
data "aws_iam_policy_document" "so_camadas_do_ecr" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::prod-${var.regiao}-starport-layer-bucket/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

# ------------------------------------------------------ registro de fluxo

resource "aws_cloudwatch_log_group" "fluxo" {
  name              = "/vpc/${local.nome}"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_iam_role" "fluxo" {
  name               = "${local.nome}-fluxo"
  assume_role_policy = data.aws_iam_policy_document.assumir["vpc-flow-logs"].json
}

data "aws_iam_policy_document" "fluxo" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.fluxo.arn}:*"]
  }
}

resource "aws_iam_role_policy" "fluxo" {
  role   = aws_iam_role.fluxo.id
  policy = data.aws_iam_policy_document.fluxo.json
}

resource "aws_flow_log" "vpc" {
  vpc_id          = aws_vpc.principal.id
  traffic_type    = "ALL"
  log_destination = aws_cloudwatch_log_group.fluxo.arn
  iam_role_arn    = aws_iam_role.fluxo.arn
}
