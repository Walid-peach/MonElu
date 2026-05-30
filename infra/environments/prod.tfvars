aws_region  = "eu-west-3"
environment = "prod"
project     = "monelu"
vpc_cidr    = "10.1.0.0/16"

# Production sizing — larger instances for throughput and reliability.
# Also enable multi_az = true in the rds module before applying to prod.
db_instance_class     = "db.r6g.large"
airflow_instance_type = "t3.large"
spark_instance_type   = "r6i.xlarge"
