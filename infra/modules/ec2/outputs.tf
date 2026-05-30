output "airflow_instance_id" {
  description = "EC2 instance ID for the Airflow host"
  value       = aws_instance.airflow.id
}

output "spark_instance_id" {
  description = "EC2 instance ID for the Spark host"
  value       = aws_instance.spark.id
}

output "airflow_public_ip" {
  description = "Public IP of the Airflow instance"
  value       = aws_instance.airflow.public_ip
}
