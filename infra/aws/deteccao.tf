# Alarmes: ataque, saúde e custo.
#
# Aqui a detecção lê o log JSON da API. As regras do Prometheus em
# observabilidade/ são mais ricas, mas pedem um coletor dentro da VPC.

resource "aws_sns_topic" "alertas" {
  name              = "${local.nome}-alertas"
  kms_master_key_id = aws_kms_key.principal.arn
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.email_de_alerta
}

locals {
  # A mensagem precisa ser idêntica à do código: o teste de detecção confere.
  deteccoes = {
    refresh-reutilizado = { mensagem = "Possible refresh token reuse attack", limite = 0 }
    trilha-falhando     = { mensagem = "Audit write failed", limite = 0 }
    senha-errada        = { mensagem = "Failed login attempt", limite = 50 }
  }
}

resource "aws_cloudwatch_log_metric_filter" "deteccao" {
  for_each       = local.deteccoes
  name           = "${local.nome}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.message = \"${each.value.mensagem}\" }"
  metric_transformation {
    name          = each.key
    namespace     = local.nome
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "deteccao" {
  for_each            = local.deteccoes
  alarm_name          = "${local.nome}-${each.key}"
  namespace           = local.nome
  metric_name         = each.key
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = each.value.limite
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "waf" {
  alarm_name          = "${local.nome}-waf-bloqueando"
  namespace           = "AWS/WAFV2"
  metric_name         = "BlockedRequests"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 200
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  dimensions          = { WebACL = local.nome, Region = var.regiao, Rule = "ALL" }
}

resource "aws_cloudwatch_metric_alarm" "erros" {
  alarm_name          = "${local.nome}-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]

  metric_query {
    id          = "taxa"
    expression  = "100 * erros / MAX([erros, total])"
    return_data = true
  }
  metric_query {
    id = "erros"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 300
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }
  metric_query {
    id = "total"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 300
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "sem_tarefa" {
  alarm_name          = "${local.nome}-sem-tarefa"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_budgets_budget" "mensal" {
  name         = local.nome
  budget_type  = "COST"
  limit_amount = tostring(var.orcamento_mensal_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.email_de_alerta]
  }
}

output "endereco" {
  value = aws_lb.api.dns_name
}

output "papel_de_deploy" {
  value = aws_iam_role.deploy.arn
}

output "segredo_do_dono_do_banco" {
  description = "Só para rodar migração e banco/usuario-da-aplicacao.sql."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}
