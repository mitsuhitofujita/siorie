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
  description = "Short commit SHA of the image to deploy: asia-northeast1-docker.pkg.dev/siorie/siorie/app:<tag>. No default; pass -var image_tag=<sha> (or TF_VAR_image_tag) at plan/apply time. Must be a tag that exists in Artifact Registry."
  type        = string
}

variable "google_client_id" {
  description = "OAuth Web client ID for the GOOGLE_CLIENT_ID env var. Non-secret but kept out of the repo; pass -var google_client_id=<id> (or TF_VAR_google_client_id) at plan/apply time (discussions 0024, 0026)."
  type        = string
}

variable "app_origin" {
  description = "The Cloud Run service's real public origin (from `terraform output cloud_run_url`), used as the Go server's APP_ORIGIN. No default; pass -var app_origin=<url> (or TF_VAR_app_origin) at plan/apply time (discussions 0025, 0026)."
  type        = string
}
