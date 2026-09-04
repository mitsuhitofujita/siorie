variable "project_id" {
  description = "The existing Google Cloud project. Created by hand; Terraform only manages resources inside it."
  type        = string
}

variable "region" {
  description = "Default region for regional resources (state bucket, and later Cloud Run / Artifact Registry / Firestore)."
  type        = string
  default     = "asia-northeast1"
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose Actions runs on main may impersonate the deployer service account through Workload Identity Federation (discussion 0029)."
  type        = string
}
