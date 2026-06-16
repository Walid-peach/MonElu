locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
  name_prefix = "${var.project}-${var.environment}"
}

module "networking" {
  source      = "./modules/networking"
  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  admin_cidr  = var.admin_cidr
  tags        = local.common_tags
}

module "s3" {
  source      = "./modules/s3"
  name_prefix = local.name_prefix
  tags        = local.common_tags
}

module "rds" {
  source              = "./modules/rds"
  name_prefix         = local.name_prefix
  instance_class      = var.db_instance_class
  db_name             = var.db_name
  db_password         = var.db_password
  subnet_ids          = module.networking.private_subnet_ids
  security_group_ids  = [module.networking.db_security_group_id]
  multi_az            = var.db_multi_az
  skip_final_snapshot = var.db_skip_final_snapshot
  deletion_protection = var.db_deletion_protection
  tags                = local.common_tags
}

module "ec2" {
  source                = "./modules/ec2"
  name_prefix           = local.name_prefix
  airflow_instance_type = var.airflow_instance_type
  spark_instance_type   = var.spark_instance_type
  subnet_id             = module.networking.private_subnet_ids[0]
  security_group_ids    = [module.networking.app_security_group_id]
  s3_bucket_arns        = module.s3.bucket_arns
  tags                  = local.common_tags
}
