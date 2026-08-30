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

# Project number, used only to build the service's own run.app origin below.
# cloudresourcemanager.googleapis.com is enabled by infra/bootstrap/.
data "google_project" "this" {
  project_id = var.project_id
}

# Runtime identity for the Cloud Run service. Created dormant, exactly like
# infra/bootstrap/'s deployer SA: the email is fixed now, no roles are bound
# yet. roles/datastore.user lands in the next round together with the Firestore
# "(default)" database; until then the service still starts (firestore.NewClient
# does not hit the network at construction time) but any Firestore-backed route
# fails at request time. GET /api/hello does not touch Firestore.
resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "siorie-run"
  display_name = "siorie Cloud Run runtime (no role bindings yet)"
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
    service_account = google_service_account.runtime.email

    # min 0 / max 1, request-based billing (0001). cpu_idle defaults to true for
    # this shape, so CPU is billed only while a request is in flight.
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      # Same path prefix as output.artifact_registry_repository, plus the image
      # name ("app") and the deploy tag (short commit SHA, passed at apply time).
      image = "${google_artifact_registry_repository.app.location}-docker.pkg.dev/${google_artifact_registry_repository.app.project}/${google_artifact_registry_repository.app.repository_id}/app:${var.image_tag}"

      # The Go server reads PORT (Cloud Run injects it) and falls back to 8080.
      ports {
        container_port = 8080
      }

      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      # The service's own URL, built from the project number: Cloud Run assigns
      # https://<name>-<project number>.<region>.run.app deterministically, and a
      # resource cannot reference its own .uri here. outputs.cloud_run_url
      # exposes the real .uri so the worklog can confirm they match. This value
      # only becomes load-bearing once a state-changing /api/* route (the Origin
      # check) is exercised, which the minimal connectivity check does not do.
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

# Coming in later worklogs: Firestore "(default)" database + roles/datastore.user
# on the runtime SA; SPA co-serving in the image (index.html fallback, asset
# cache headers); a DELETE cleanup policy for the repository above (and
# cleanup_policy_dry_run = false); APP_ORIGIN moved from the built string to the
# real cloud_run_url; billing budget + alert; Cloud Monitoring; CI/CD automation
# (GitHub Actions + Workload Identity Federation).
