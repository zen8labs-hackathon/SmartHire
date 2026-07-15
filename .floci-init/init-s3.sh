#!/bin/sh
# Runs against the local floci container on startup (mounted to
# /etc/floci/init.d by docker-compose.yml). Creates the app's S3 bucket and
# sets a CORS policy allowing the Next.js dev origin to PUT directly via
# presigned URLs (lib/storage/s3.ts::createSignedUploadUrl) -- without this,
# browser uploads fail preflight with "No 'Access-Control-Allow-Origin' header".
set -e

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"

ENDPOINT="http://localhost:4566"
BUCKET="${S3_BUCKET:-smart-hire-bucket}"

aws --endpoint-url="$ENDPOINT" s3api create-bucket --bucket "$BUCKET" 2>/dev/null || true

aws --endpoint-url="$ENDPOINT" s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:3000"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}'
