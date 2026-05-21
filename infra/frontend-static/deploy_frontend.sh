#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT_DIR/infra/frontend-static/terraform"
FRONTEND_DIR="$ROOT_DIR/frontend/web"

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform not found" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found" >&2
  exit 1
fi

cd "$TF_DIR"
BUCKET_NAME="$(terraform output -raw s3_bucket_name)"
DISTRIBUTION_ID="$(terraform output -raw cloudfront_distribution_id)"

cd "$FRONTEND_DIR"
npm ci
npm run build

aws s3 sync dist "s3://$BUCKET_NAME" --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*'

echo "Done. CloudFront distribution invalidated."