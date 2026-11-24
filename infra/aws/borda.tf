# Balanceador e WAF.

# Público de propósito: é a porta de entrada.
#trivy:ignore:AWS-0053
resource "aws_lb" "api" {
  name                       = local.nome
  load_balancer_type         = "application"
  subnets                    = aws_subnet.publica[*].id
  security_groups            = [aws_security_group.grupo["alb"].id]
  drop_invalid_header_fields = true
  desync_mitigation_mode     = "strictest"
  enable_deletion_protection = local.producao
}

resource "aws_lb_target_group" "api" {
  name                 = local.nome
  port                 = 3001
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30
  health_check {
    path                = "/health/ready"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificado_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "not found"
      status_code  = "404"
    }
  }
}

# Lista de permissão: só o que a API publica. /health com detalhe de dependência
# e qualquer rota futura esquecida ficam fora da internet.
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  condition {
    path_pattern {
      values = ["/api/v1/*"]
    }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ------------------------------------------------------------------- WAF

locals {
  regras_da_aws = {
    AWSManagedRulesAmazonIpReputationList = 10
    AWSManagedRulesCommonRuleSet          = 20
    AWSManagedRulesKnownBadInputsRuleSet  = 30
    AWSManagedRulesSQLiRuleSet            = 40
  }
}

resource "aws_wafv2_web_acl" "borda" {
  name  = local.nome
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # O limite da API é por instância e por IP, na memória de cada uma. Este vale
  # para todas, antes de gastar um bcrypt.
  rule {
    name     = "limite-de-autenticacao"
    priority = 1
    action {
      block {
        custom_response {
          response_code = 429
        }
      }
    }
    statement {
      rate_based_statement {
        limit                 = 100
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/v1/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NORMALIZE_PATH"
            }
          }
        }
      }
    }
    visibility_config {
      metric_name                = "limite-de-autenticacao"
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = false
    }
  }

  dynamic "rule" {
    for_each = local.regras_da_aws
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          name        = rule.key
          vendor_name = "AWS"
        }
      }
      visibility_config {
        metric_name                = rule.key
        cloudwatch_metrics_enabled = true
        sampled_requests_enabled   = false
      }
    }
  }

  # Amostra desligada: guardaria corpo de login na console.
  visibility_config {
    metric_name                = local.nome
    cloudwatch_metrics_enabled = true
    sampled_requests_enabled   = false
  }
}

resource "aws_wafv2_web_acl_association" "borda" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.borda.arn
}

# O nome precisa começar com aws-waf-logs-.
resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${local.nome}"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_wafv2_web_acl_logging_configuration" "borda" {
  resource_arn            = aws_wafv2_web_acl.borda.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
  redacted_fields {
    query_string {}
  }
}
