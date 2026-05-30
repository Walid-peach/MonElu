variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
}

variable "instance_type" {
  description = "MSK broker instance type"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where MSK is deployed"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for MSK broker nodes (one per broker)"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs attached to the MSK cluster"
  type        = list(string)
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
