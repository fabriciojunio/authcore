# Infraestrutura da API do AuthCore na AWS.
#
# O estado guarda a senha do Redis e fica num bucket S3 com trava nativa; a
# criptografia do estado no cliente é ligada por TF_ENCRYPTION, com chave KMS.
# Nome de bucket e de conta entram no init, não no código.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.74"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.regiao

  default_tags {
    tags = {
      projeto    = "authcore"
      ambiente   = var.ambiente
      gerenciado = "opentofu"
    }
  }
}

variable "ambiente" {
  description = "Uma conta AWS por ambiente."
  type        = string
  validation {
    condition     = contains(["homologacao", "producao"], var.ambiente)
    error_message = "ambiente precisa ser homologacao ou producao."
  }
}

variable "regiao" {
  description = "São Paulo: dado pessoal de brasileiro fica no Brasil. O certificado do banco na imagem é desta região."
  type        = string
  default     = "sa-east-1"
}

variable "imagem_digest" {
  description = "Digest da imagem no ECR. Deploy por digest, nunca por tag."
  type        = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.imagem_digest))
    error_message = "imagem_digest precisa ser um digest sha256 completo."
  }
}

variable "certificado_arn" {
  type = string
  validation {
    condition     = can(regex("^arn:aws:acm:", var.certificado_arn))
    error_message = "certificado_arn precisa ser um ARN do ACM."
  }
}

variable "origem_do_front" {
  description = "Origem exata do front. Vale para CORS, CSRF e passkey."
  type        = string
  validation {
    condition     = can(regex("^https://[a-z0-9.-]+$", var.origem_do_front))
    error_message = "a origem precisa ser https, sem caminho e sem curinga."
  }
}

variable "senha_do_redis" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[A-Za-z0-9]{32,128}$", var.senha_do_redis))
    error_message = "use de 32 a 128 letras e números aleatórios."
  }
}

variable "repositorio_github" {
  type    = string
  default = "fabriciojunio/authcore"
  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.repositorio_github))
    error_message = "repositorio_github precisa ser dono/nome."
  }
}

variable "email_de_alerta" {
  type = string
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.email_de_alerta))
    error_message = "e-mail inválido."
  }
}

variable "orcamento_mensal_usd" {
  type    = number
  default = 250
}

data "aws_caller_identity" "atual" {}

data "aws_availability_zones" "disponiveis" {
  state = "available"
}

locals {
  nome     = "authcore-${var.ambiente}"
  producao = var.ambiente == "producao"
  zonas    = slice(data.aws_availability_zones.disponiveis.names, 0, 2)
  conta    = data.aws_caller_identity.atual.account_id
}
