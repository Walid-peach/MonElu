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

# Production: use manage_master_user_password = true (RDS-managed Secrets Manager
# rotation) or pass the value via TF_VAR_db_password from a secrets store.
# No default — Terraform will refuse to plan without an explicit value.
variable "db_password" {
  description = "PostgreSQL master password — must be supplied via Secrets Manager or env var, never hardcoded"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ for automatic failover (set true in prod)"
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on destroy (set false in prod to protect against data loss)"
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Prevent accidental destruction via terraform destroy (set true in prod)"
  type        = bool
  default     = false
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
