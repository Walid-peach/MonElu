output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the two public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the two private subnets"
  value       = aws_subnet.private[*].id
}

output "app_security_group_id" {
  description = "Security group ID for EC2 instances (Airflow, Spark)"
  value       = aws_security_group.app.id
}

output "db_security_group_id" {
  description = "Security group ID for RDS (inbound from app SG only)"
  value       = aws_security_group.db.id
}
