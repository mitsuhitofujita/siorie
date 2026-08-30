provider "google" {
  project = var.project_id
  region  = var.region
}

# First real resource in this layer. Container images for the future Cloud Run
# service are pushed here by `just infra/publish-image`; the canonical reference
# is asia-northeast1-docker.pkg.dev/<project>/siorie/app:<git-sha>.
#
# artifactregistry.googleapis.com is enabled by infra/bootstrap/
# (google_project_service.enabled); this layer consumes that enablement but does
# not manage it, so apply here assumes bootstrap has been applied.
resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = "siorie"
  format        = "DOCKER"
  description   = "Container images for the siorie Cloud Run service (image: app)."

  # KEEP only. In Artifact Registry a KEEP policy on its own deletes nothing —
  # it marks versions to protect from a DELETE policy. The DELETE policy that
  # actually enforces "keep the most recent 2, remove the rest" is deferred to
  # the Cloud Run topic, together with flipping cleanup_policy_dry_run to false.
  # Until then this only records the retention intent. With no deploys yet,
  # image count stays near zero and well inside the Artifact Registry free tier.
  cleanup_policy_dry_run = true

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 2
    }
  }
}

# Coming in later worklogs: Cloud Run service, runtime service account + IAM,
# Firestore "(default)" database, billing budget + alert, Cloud Monitoring, a
# DELETE cleanup policy for the repository above.
