locals {
  name_prefix = var.project_name

  # Only add Lambda origins/behaviors when the domain is provided
  auth_lambda_enabled      = var.auth_lambda_domain != ""
  forms_lambda_enabled     = var.forms_lambda_domain != ""
  documents_lambda_enabled = var.documents_lambda_domain != ""
}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  effective_bucket_name = var.bucket_name != "" ? var.bucket_name : "${local.name_prefix}-frontend-${random_id.suffix.hex}"
  s3_origin_id          = "s3-frontend"
  api_origin_id         = "api-origin"
}

# --- S3 (private) ---
resource "aws_s3_bucket" "frontend" {
  bucket = local.effective_bucket_name
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# --- CloudFront -> S3 access (OAC) ---
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "OAC for S3 static frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Disable caching for /api/*
resource "aws_cloudfront_cache_policy" "api_no_cache" {
  name        = "${local.name_prefix}-api-no-cache-${random_id.suffix.hex}"
  comment     = "No caching for API routes"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = false
    enable_accept_encoding_brotli = false

    headers_config {
      header_behavior = "none"
    }

    cookies_config {
      cookie_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_origin_request_policy" "api_forward" {
  name    = "${local.name_prefix}-api-forward-${random_id.suffix.hex}"
  comment = "Forward headers needed for auth/CORS; forward all query strings"

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Authorization",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
        "X-User-Id",
      ]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} frontend"
  aliases             = var.cloudfront_aliases

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  origin {
    domain_name = var.api_origin_domain
    origin_id   = local.api_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = var.api_origin_protocol_policy
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  dynamic "origin" {
    for_each = local.auth_lambda_enabled ? [1] : []
    content {
      domain_name = var.auth_lambda_domain
      origin_id   = "auth-lambda"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  dynamic "origin" {
    for_each = local.forms_lambda_enabled ? [1] : []
    content {
      domain_name = var.forms_lambda_domain
      origin_id   = "forms-lambda"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  dynamic "origin" {
    for_each = local.documents_lambda_enabled ? [1] : []
    content {
      domain_name = var.documents_lambda_domain
      origin_id   = "documents-lambda"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    compress = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # Per-service Lambda behaviors — must come before the generic /api/* fallback
  dynamic "ordered_cache_behavior" {
    for_each = local.auth_lambda_enabled ? [1] : []
    content {
      path_pattern           = "/api/auth/*"
      target_origin_id       = "auth-lambda"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      compress               = true
      cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
      origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward.id
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.forms_lambda_enabled ? [1] : []
    content {
      path_pattern           = "/api/forms/*"
      target_origin_id       = "forms-lambda"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      compress               = true
      cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
      origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward.id
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.documents_lambda_enabled ? [1] : []
    content {
      path_pattern           = "/api/documents/*"
      target_origin_id       = "documents-lambda"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      compress               = true
      cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
      origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward.id
    }
  }

  # Fallback: remaining /api/* traffic still goes to saln1.upcsweb.dev
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = local.api_origin_id
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = [
      "GET",
      "HEAD",
      "OPTIONS",
      "PUT",
      "POST",
      "PATCH",
      "DELETE",
    ]

    cached_methods = ["GET", "HEAD", "OPTIONS"]

    compress = true

    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward.id
  }

  # SPA deep links: return index.html on 403/404 from S3
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == ""
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : null
  }

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Allow only this CloudFront distribution to read from the bucket
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowCloudFrontRead"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}
