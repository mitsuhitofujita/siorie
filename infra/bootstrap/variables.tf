variable "project_id" {
  description = "The existing Google Cloud project. Created by hand; Terraform only manages resources inside it."
  type        = string
}

variable "region" {
  description = "Default region for regional resources (state bucket, and later Cloud Run / Artifact Registry / Firestore)."
  type        = string
  default     = "asia-northeast1"
}
