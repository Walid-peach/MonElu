# MSK cluster — future streaming phase.
# Provisioned here for infrastructure completeness; not actively used until
# the streaming pipeline is implemented. 2 brokers across 2 private subnets.
resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.name_prefix}-kafka"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 2

  broker_node_group_info {
    instance_type   = var.instance_type
    client_subnets  = var.subnet_ids
    security_groups = var.security_group_ids

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-kafka" })
}
