variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "monelu"
}

# Production: this must come from AWS Secrets Manager, never hardcoded.
# Use manage_master_user_password = true (RDS-managed Secrets Manager rotation)
# or pass the secret ARN and retrieve it with aws_secretsmanager_secret_version.
variable "db_password" {
  description = "PostgreSQL master password — use Secrets Manager in production"
  type        = string
  sensitive   = true
  default     = "changeme-replace-with-secrets-manager"
}

variable "vpc_id" {
  description = "VPC ID where RDS is deployed"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs attached to the RDS instance"
  type        = list(string)
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
