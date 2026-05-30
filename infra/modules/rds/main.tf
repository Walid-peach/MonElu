resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = merge(var.tags, { Name = "${var.name_prefix}-db-subnet-group" })
}

# Parameter group for PostgreSQL 15.
# pgvector requires no special parameter group — the extension is installed
# via CREATE EXTENSION in SQL after provisioning.
resource "aws_db_parameter_group" "postgres15" {
  name   = "${var.name_prefix}-pg15"
  family = "postgres15"

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-pg15" })
}

resource "aws_db_instance" "main" {
  identifier = "${var.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = "15"
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.db_username
  # Production: never hardcode this value. Use manage_master_user_password = true
  # to delegate password lifecycle to RDS-managed Secrets Manager rotation,
  # or read the secret ARN via aws_secretsmanager_secret_version.
  password = var.db_password

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids
  parameter_group_name   = aws_db_parameter_group.postgres15.name

  multi_az = var.multi_az

  backup_retention_period = 7
  skip_final_snapshot     = var.skip_final_snapshot
  deletion_protection     = var.deletion_protection

  tags = merge(var.tags, { Name = "${var.name_prefix}-postgres" })
}
