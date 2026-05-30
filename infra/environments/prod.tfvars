aws_region  = "eu-west-3"
environment = "prod"
project     = "monelu"
vpc_cidr    = "10.1.0.0/16"

# Production sizing — larger instances for throughput and reliability.
db_instance_class     = "db.r6g.large"
airflow_instance_type = "t3.large"
spark_instance_type   = "r6i.xlarge"

# RDS safety flags — protect production data from accidental loss.
db_multi_az            = true
db_skip_final_snapshot = false
db_deletion_protection = true

# Restrict admin ports to your office/VPN CIDR before applying.
# admin_cidr = "x.x.x.x/32"
