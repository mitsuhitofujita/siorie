variable "project_id" {
  description = "The existing Google Cloud project."
  type        = string
}

variable "region" {
  description = "Default region for regional resources."
  type        = string
  default     = "asia-northeast1"
}
