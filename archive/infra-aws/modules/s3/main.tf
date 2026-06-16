locals {
  buckets = toset(["bronze", "silver", "gold", "artifacts"])
}

resource "aws_s3_bucket" "buckets" {
  for_each = local.buckets
  bucket   = "${var.name_prefix}-${each.key}"
  tags     = merge(var.tags, { Name = "${var.name_prefix}-${each.key}", Layer = each.key })
}

resource "aws_s3_bucket_versioning" "buckets" {
  for_each = aws_s3_bucket.buckets
  bucket   = each.value.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "buckets" {
  for_each = aws_s3_bucket.buckets
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "buckets" {
  for_each                = aws_s3_bucket.buckets
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: transition bronze objects to Glacier after 90 days.
# Raw ingestion data is rarely re-read after the silver layer is built.
resource "aws_s3_bucket_lifecycle_configuration" "bronze" {
  bucket = aws_s3_bucket.buckets["bronze"].id
  rule {
    id     = "glacier-transition"
    status = "Enabled"
    filter {}
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}
