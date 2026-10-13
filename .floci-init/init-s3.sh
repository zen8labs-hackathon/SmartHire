#!/bin/sh
# Runs against the local floci container on startup (mounted to
# /etc/floci/init/ready.d by docker-compose.yml). Creates the app's S3 bucket and
# sets a CORS policy allowing the Next.js dev origin to PUT directly via
# presigned URLs (lib/storage/s3.ts::createSignedUploadUrl) -- without this,
# browser uploads fail preflight with "No 'Access-Control-Allow-Origin' header".
set -e

# Auto-install curl inside the container if it is not present
if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found, attempting to install..."
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache curl || true
  elif command -v microdnf >/dev/null 2>&1; then
    microdnf install -y curl || true
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y curl || true
  fi
fi

if ! command -v curl >/dev/null 2>&1; then
  # Newer floci images ship without curl or a package manager. Exiting non-zero here makes floci
  # shut itself down (restart loop -> ERR_CONNECTION_REFUSED on :4566). The bucket + CORS are
  # persisted in ./floci-data, so skipping is safe once they exist.
  echo "Warning: curl is not available; skipping S3 bucket/CORS init (persisted in floci-data)."
  exit 0
fi

ENDPOINT="http://localhost:4566"
BUCKET="${S3_BUCKET:-smart-hire-bucket}"

echo "Creating S3 bucket: $BUCKET..."
curl -s -X PUT "$ENDPOINT/$BUCKET" || true

echo "Applying CORS policy..."
CORS_XML='<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><CORSRule><AllowedOrigin>http://localhost:3000</AllowedOrigin><AllowedOrigin>http://localhost:3100</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>POST</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3000</MaxAgeSeconds></CORSRule></CORSConfiguration>'

curl -s -f -X PUT -H "Content-Type: application/xml" -d "$CORS_XML" "$ENDPOINT/$BUCKET?cors"
echo "S3 Bucket initialization completed successfully!"
