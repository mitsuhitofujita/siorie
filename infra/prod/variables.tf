variable "project_id" {
  description = "The existing Google Cloud project."
  type        = string
}

variable "region" {
  description = "Default region for regional resources."
  type        = string
  default     = "asia-northeast1"
}

variable "image_tag" {
  description = "Short commit SHA of the image to deploy: asia-northeast1-docker.pkg.dev/siorie/siorie/app:<tag>. No default; pass -var image_tag=<sha> (or TF_VAR_image_tag) at plan/apply time."
  type        = string
}

variable "google_client_id" {
  description = "OAuth Web client ID for the GOOGLE_CLIENT_ID env var. Non-secret but kept out of the repo; pass -var google_client_id=<id> (or TF_VAR_google_client_id) at plan/apply time."
  type        = string
}
