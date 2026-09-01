provider "google" {
  project = var.project_id
  region  = var.region
}

# --- 0027 migration -----------------------------------------------------------
# The Artifact Registry repository and the runtime service account already exist
# in the project; they were previously managed by infra/prod/. These two import
# blocks move them into this layer's state without destroy/recreate. After the
# first `terraform apply` here has run and `infra/prod/` has been retired
# (`state rm`, not `destroy`), delete both blocks in a follow-up commit.
import {
  to = google_artifact_registry_repository.app
  id = "projects/siorie/locations/asia-northeast1/repositories/siorie"
}

import {
  to = google_service_account.runtime
  id = "projects/siorie/serviceAccounts/siorie-run@siorie.iam.gserviceaccount.com"
}
# --- end 0027 migration -----------------------------------------------------

# Container images for the Cloud Run service are pushed here by
# `just infra/publish-image`; the canonical reference is
# asia-northeast1-docker.pkg.dev/<project>/siorie/app:<git-sha>.
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
  # actually enforces "keep the most recent 2, remove the rest" is still
  # deferred (it lands in this layer), together with flipping
  # cleanup_policy_dry_run to false. Until then this only records the retention
  # intent. With one image pushed, count stays well inside the free tier.
  cleanup_policy_dry_run = true

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 2
    }
  }
}

# Runtime identity for the Cloud Run service (infra/app/). roles/datastore.user
# is granted just below, so this is no longer a dormant SA.
resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "siorie-run"
  display_name = "siorie Cloud Run runtime"
}

# Firestore "(default)" database. Native mode, single-region asia-northeast1 —
# both are permanent (location and mode cannot be changed after creation), so
# this resource is guarded twice against deletion:
#   - delete_protection_state (GCP-side): the API refuses to delete the database.
#   - lifecycle.prevent_destroy (Terraform-side): plan errors on any destroy or
#     replace of this resource.
# Removing it takes deliberately clearing both. Point-in-time recovery is left
# at its default (disabled) for cost; enable it separately if needed. No
# security-rules or composite-index resources: all access is through the Go
# backend's Application Default Credentials, never a client SDK.
resource "google_firestore_database" "default" {
  project                     = var.project_id
  name                        = "(default)"
  location_id                 = var.region
  type                        = "FIRESTORE_NATIVE"
  app_engine_integration_mode = "DISABLED"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"

  lifecycle {
    prevent_destroy = true
  }
}

# The runtime SA needs read/write on Firestore. Non-authoritative
# (google_project_iam_member): it adds this one binding without touching other
# members of roles/datastore.user. This is the binding discussion 0024 deferred;
# with it, /api/me and the group/item endpoints work in production.
resource "google_project_iam_member" "runtime_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Deferred to this layer (0024's follow-ups): a DELETE cleanup policy for the
# repository above (and cleanup_policy_dry_run = false); the billing budget +
# alert; Cloud Monitoring.
