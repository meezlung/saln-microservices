# Frontend Static Hosting (S3 + CloudFront)

This provisions the **React/Vite** frontend as a static site:
- S3 bucket (private)
- CloudFront distribution (CDN)
  - `/*` -> S3 (SPA)
  - `/api/*` -> API origin (API Gateway / ALB / Nginx) with **no caching**
  - SPA deep links: CloudFront maps 403/404 to `/index.html`

## Prereqs
- AWS account + credentials available in your shell (e.g., `aws configure`)
- AWS CLI installed (`aws`)
- Terraform installed
- Node.js installed (to build the frontend)

## Deploy (Terraform)
From this folder:

```bash
cd terraform
terraform init
terraform apply \
  -var 'project_name=saln' \
  -var 'aws_region=ap-southeast-1' \
  -var 'api_origin_domain=CHANGE-ME.execute-api.ap-southeast-1.amazonaws.com'
```

Terraform outputs:
- `cloudfront_domain_name`
- `cloudfront_distribution_id`
- `s3_bucket_name`

Tip: copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars` and edit it, then you can run `terraform apply` without repeating all `-var` flags.

To use a custom domain, also set:
- `cloudfront_aliases = ["saln1a.upcsweb.dev"]`
- `acm_certificate_arn = "arn:aws:acm:us-east-1:..."`

The ACM certificate must be issued in `us-east-1` for CloudFront.

## Deploy (Frontend build + upload)
After Terraform:

```bash
./deploy_frontend.sh
```

This script:
- runs `npm ci && npm run build` in `frontend/web`
- uploads `dist/` to S3
- invalidates CloudFront (`/*`)

## DNS (CNAME)
If you’re using your own domain:
- Create a CNAME like `www.yourdomain.tld` -> the Terraform output `cloudfront_domain_name`

If your DNS provider doesn’t allow CNAME at the root/apex, use a subdomain (recommended).
