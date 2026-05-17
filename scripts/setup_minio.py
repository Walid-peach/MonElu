import boto3
from botocore.exceptions import ClientError


def setup_buckets():
    s3 = boto3.client(
        "s3",
        endpoint_url="http://localhost:9000",
        aws_access_key_id="minioadmin",
        aws_secret_access_key="minioadmin",
    )
    buckets = ["monelu-bronze", "monelu-checkpoints"]
    for bucket in buckets:
        try:
            s3.create_bucket(Bucket=bucket)
            print(f"Created: {bucket}")
        except ClientError as e:
            if e.response["Error"]["Code"] == "BucketAlreadyOwnedByYou":
                print(f"Already exists: {bucket}")
            else:
                raise


if __name__ == "__main__":
    setup_buckets()
