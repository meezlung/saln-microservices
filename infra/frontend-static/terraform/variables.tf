variable "project_name" {
  type        = string
  description = "Prefix for resource names."
}

variable "aws_region" {
  type        = string
  description = "AWS region for S3 and Terraform operations."
}

variable "bucket_name" {
  type        = string
  description = "Optional fixed S3 bucket name (leave empty to auto-generate)."
  default     = ""
}

variable "cloudfront_aliases" {
  type        = list(string)
  description = "Optional alternate domain names for the CloudFront distribution."
  default     = []
}

variable "acm_certificate_arn" {
  type        = string
  description = "Optional ACM certificate ARN for CloudFront. Must be in us-east-1."
  default     = ""
}

variable "api_origin_domain" {
  type        = string
  description = "Domain name for the API origin (e.g. abc123.execute-api.ap-southeast-1.amazonaws.com). No scheme, no path."
}

variable "api_origin_protocol_policy" {
  type        = string
  description = "How CloudFront connects to the API origin."
  default     = "https-only"
  validation {
    condition     = contains(["http-only", "https-only", "match-viewer"], var.api_origin_protocol_policy)
    error_message = "api_origin_protocol_policy must be one of: http-only, https-only, match-viewer"
  }
}

variable "auth_lambda_domain" {
  description = "Auth Lambda Function URL domain without https:// (e.g. abc123.lambda-url.ap-southeast-2.on.aws). Leave empty to skip."
  type        = string
  default     = ""
}

variable "forms_lambda_domain" {
  description = "Forms Lambda Function URL domain without https:// (e.g. abc123.lambda-url.ap-southeast-2.on.aws). Leave empty to skip."
  type        = string
  default     = ""
}

variable "documents_lambda_domain" {
  description = "Documents Lambda Function URL domain without https:// (e.g. abc123.lambda-url.ap-southeast-2.on.aws). Leave empty to skip."
  type        = string
  default     = ""
}
