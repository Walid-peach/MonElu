output "bucket_names" {
  description = "Names of all S3 buckets (bronze, silver, gold, artifacts)"
  value       = [for b in aws_s3_bucket.buckets : b.bucket]
}

output "bucket_arns" {
  description = "ARNs of all S3 buckets"
  value       = [for b in aws_s3_bucket.buckets : b.arn]
}
