output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "s3_bucket_names" {
  description = "Names of all S3 buckets"
  value       = module.s3.bucket_names
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
}

output "airflow_instance_id" {
  description = "EC2 instance ID for Airflow"
  value       = module.ec2.airflow_instance_id
}
