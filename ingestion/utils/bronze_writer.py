from __future__ import annotations

import json
import os
from datetime import datetime

import boto3
from botocore.exceptions import ClientError


class BronzeWriter:
    def __init__(self):
        self.s3 = boto3.client(
            "s3",
            endpoint_url=os.getenv("MINIO_ENDPOINT", "http://localhost:9000"),
            aws_access_key_id=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            aws_secret_access_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        )
        self.bucket = "monelu-bronze"
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self.s3.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.s3.create_bucket(Bucket=self.bucket)

    def write(self, entity: str, data: list[dict], run_date: str = None) -> str:
        """
        Write raw JSON to Bronze layer.
        Path: s3://monelu-bronze/{entity}/year=Y/month=M/day=D/{timestamp}.json
        Returns the S3 path written.
        """
        if run_date is None:
            run_date = datetime.utcnow().strftime("%Y-%m-%d")

        dt = datetime.strptime(run_date, "%Y-%m-%d")
        key = (
            f"{entity}/"
            f"year={dt.year}/"
            f"month={dt.month:02d}/"
            f"day={dt.day:02d}/"
            f"{entity}_{datetime.utcnow().strftime('%H%M%S')}.json"
        )

        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(data, ensure_ascii=False, default=str),
            ContentType="application/json",
        )
        print(f"Bronze written: s3://{self.bucket}/{key} ({len(data)} records)")
        return f"s3://{self.bucket}/{key}"

    def read_by_key(self, path: str) -> list[dict]:
        """Read a specific Bronze file by its full s3:// path (as returned by write())."""
        prefix = f"s3://{self.bucket}/"
        key = path[len(prefix) :] if path.startswith(prefix) else path
        obj = self.s3.get_object(Bucket=self.bucket, Key=key)
        return json.loads(obj["Body"].read())

    def read_latest(self, entity: str) -> list[dict]:
        """Read the most recent Bronze file for an entity."""
        prefix = f"{entity}/"
        response = self.s3.list_objects_v2(
            Bucket=self.bucket,
            Prefix=prefix,
        )
        if "Contents" not in response:
            return []
        contents = [o for o in response["Contents"] if not o["Key"].endswith("_last_hash.txt")]
        if not contents:
            return []
        latest = sorted(contents, key=lambda x: x["LastModified"], reverse=True)[0]
        obj = self.s3.get_object(Bucket=self.bucket, Key=latest["Key"])
        return json.loads(obj["Body"].read())

    def get_last_hash(self, entity: str) -> str | None:
        """Get the MD5 hash of the last Bronze write for change detection."""
        try:
            obj = self.s3.get_object(
                Bucket=self.bucket,
                Key=f"{entity}/_last_hash.txt",
            )
            return obj["Body"].read().decode()
        except ClientError:
            return None

    def save_hash(self, entity: str, hash_value: str):
        """Save MD5 hash after successful write."""
        self.s3.put_object(
            Bucket=self.bucket,
            Key=f"{entity}/_last_hash.txt",
            Body=hash_value.encode(),
        )
