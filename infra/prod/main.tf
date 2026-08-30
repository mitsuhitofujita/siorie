provider "google" {
  project = var.project_id
  region  = var.region
}

# Skeleton only. Zero managed resources — this layer exists so far just to prove
# the GCS backend (bucket from infra/bootstrap/) connects and `terraform plan`
# returns "No changes".
#
# Coming in a later worklog: Cloud Run service, Artifact Registry repository
# (+ cleanup policy), Firestore "(default)" database, runtime service account
# + IAM, billing budget + alert, Cloud Monitoring.
