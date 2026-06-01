output "airflow_instance_id" {
  description = "EC2 instance ID for the Airflow host"
  value       = aws_instance.airflow.id
}

output "spark_instance_id" {
  description = "EC2 instance ID for the Spark host"
  value       = aws_instance.spark.id
}

output "airflow_private_ip" {
  description = "Private IP of the Airflow instance (use SSM Session Manager or a bastion for access)"
  value       = aws_instance.airflow.private_ip
}
