variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
}

variable "airflow_instance_type" {
  description = "EC2 instance type for the Airflow host"
  type        = string
}

variable "spark_instance_type" {
  description = "EC2 instance type for the Spark host"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for the EC2 instances"
  type        = string
}

variable "security_group_ids" {
  description = "Security group IDs attached to the instances"
  type        = list(string)
}

variable "s3_bucket_arns" {
  description = "ARNs of the S3 buckets the EC2 instances need read/write access to"
  type        = list(string)
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
