variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "eu-west-3" # Paris
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name for tagging"
  type        = string
  default     = "monelu"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "monelu"
}

variable "db_password" {
  description = "PostgreSQL master password — must be supplied via Secrets Manager or TF_VAR_db_password env var, never hardcoded"
  type        = string
  sensitive   = true
}

variable "airflow_instance_type" {
  description = "EC2 instance type for Airflow"
  type        = string
  default     = "t3.medium"
}

variable "spark_instance_type" {
  description = "EC2 instance type for Spark"
  type        = string
  default     = "t3.xlarge"
}

variable "admin_cidr" {
  description = "CIDR allowed to reach admin ports (SSH port 22, Airflow UI port 8080). Leave empty to keep those ports closed."
  type        = string
  default     = ""
}

variable "db_multi_az" {
  description = "Enable RDS Multi-AZ (set true in prod)"
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip RDS final snapshot on destroy (set false in prod)"
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Enable RDS deletion protection (set true in prod)"
  type        = bool
  default     = false
}
