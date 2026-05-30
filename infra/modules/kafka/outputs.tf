output "bootstrap_brokers" {
  description = "TLS bootstrap broker string for Kafka clients"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
}

output "cluster_arn" {
  description = "MSK cluster ARN"
  value       = aws_msk_cluster.main.arn
}
