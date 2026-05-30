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
  source             = "./modules/rds"
  name_prefix        = local.name_prefix
  instance_class     = var.db_instance_class
  db_name            = var.db_name
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.db_security_group_id]
  tags               = local.common_tags
}

module "ec2" {
  source                = "./modules/ec2"
  name_prefix           = local.name_prefix
  airflow_instance_type = var.airflow_instance_type
  spark_instance_type   = var.spark_instance_type
  vpc_id                = module.networking.vpc_id
  subnet_id             = module.networking.public_subnet_ids[0]
  security_group_ids    = [module.networking.app_security_group_id]
  tags                  = local.common_tags
}
