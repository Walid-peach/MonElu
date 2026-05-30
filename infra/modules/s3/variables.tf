variable "name_prefix" {
  description = "Prefix for bucket names"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
