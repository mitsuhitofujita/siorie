provider "google" {
  project = var.project_id
  region  = var.region
}

# --- 0027 migration -----------------------------------------------------------
# The Cloud Run service and its public invoker binding already exist; they were
# previously managed by infra/prod/. These import blocks move them into this
# layer's state without destroy/recreate. After the first `terraform apply` here
# and the retirement of infra/prod/ (`state rm`, not `destroy`), delete both
# blocks in a follow-up commit.
import {
  to = google_cloud_run_v2_service.app
  id = "projects/siorie/locations/asia-northeast1/services/siorie"
}

import {
  to = google_cloud_run_v2_service_iam_member.public
  id = "projects/siorie/locations/asia-northeast1/services/siorie roles/run.invoker allUsers"
}
# --- end 0027 migration -----------------------------------------------------

# This layer holds only what changes on every deploy (the Cloud Run service).
# Everything it depends on lives in infra/platform/ and is read back from GCP
# directly through data sources — no terraform_remote_state, so a plan here
# needs only ordinary project read access (discussion 0027). There is no
# cross-module depends_on: when both layers change, apply platform first.

# Project number, used only to build the service's own run.app origin below.
data "google_project" "this" {
  project_id = var.project_id
}

# Artifact Registry repository (managed by infra/platform/). Supplies the image
# path prefix; location and repository_id are the lookup keys, .project is read
# back.
data "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "siorie"
}

# Runtime identity (managed by infra/platform/, with roles/datastore.user).
data "google_service_account" "runtime" {
  account_id = "siorie-run"
}

# The Cloud Run service. Runs the image pushed by `just infra/publish-image`
# (Go binary only for now; the SPA is co-served in a later round without
# changing this image reference).
resource "google_cloud_run_v2_service" "app" {
  name     = "siorie"
  project  = var.project_id
  location = var.region

  # Provider 6.x defaults this to true. The service holds no data and is
  # recreated from a published image in a single apply, so keep destroy/recreate
  # friction-free.
  deletion_protection = false

  # Reachable from the internet; the Go API is the authorization boundary (0001).
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = data.google_service_account.runtime.email

    # min 0 / max 1, request-based billing (0001). cpu_idle defaults to true for
    # this shape, so CPU is billed only while a request is in flight.
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      # <ar-path>/app:<tag>. The prefix is rebuilt from the platform layer's
      # repository data source, exactly as infra/platform/outputs.tf does it.
      image = "${data.google_artifact_registry_repository.app.location}-docker.pkg.dev/${data.google_artifact_registry_repository.app.project}/${data.google_artifact_registry_repository.app.repository_id}/app:${var.image_tag}"

      # The Go server reads PORT (Cloud Run injects it) and falls back to 8080.
      ports {
        container_port = 8080
      }

      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      # The service's own URL, built from the project number: Cloud Run assigns
      # https://<name>-<project number>.<region>.run.app on newer projects, and
      # a resource cannot reference its own .uri here. This project actually
      # gets the legacy hash form (https://siorie-u6y3wdsaua-an.a.run.app), so
      # this built value is WRONG in production — discussion 0025 owns the fix.
      # It only becomes load-bearing once a state-changing /api/* route (the
      # Origin check) is exercised. outputs.cloud_run_url exposes the real .uri.
      env {
        name  = "APP_ORIGIN"
        value = "https://siorie-${data.google_project.this.number}.${var.region}.run.app"
      }

      env {
        name  = "FIRESTORE_PROJECT_ID"
        value = var.project_id
      }
    }
  }
}

# Public, unauthenticated invocation. 0001: the Cloud Run service is reachable
# from the internet and the Go API does authn/authz itself. This project has no
# organization and no domain-restriction org policy, so allUsers is accepted.
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
