variable "project_id" {
  description = "The existing Google Cloud project."
  type        = string
}

variable "region" {
  description = "Default region for regional resources (Artifact Registry, Firestore)."
  type        = string
  default     = "asia-northeast1"
}

# No default-less variables beyond project_id: this layer changes rarely and a
# bare `just infra/plan platform` must work without -var flags. Per-deploy
# inputs (image_tag, google_client_id) live only in infra/app/ (discussions
# 0026, 0027).
