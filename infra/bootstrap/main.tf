provider "google" {
  project = var.project_id
  region  = var.region
}

# APIs enabled here cover the bootstrap layer itself plus the near-future prod
# layer (Cloud Run, Artifact Registry, Firestore) and the planned GitHub Actions
# + Workload Identity Federation deploy path (sts, iamcredentials). Enabling is
# free and idempotent, so the whole known set is turned on in one place; the
# prod layer documents which of these it actually consumes.
locals {
  services = [
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "cloudbilling.googleapis.com",
    "billingbudgets.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ]
}

resource "google_project_service" "enabled" {
  for_each = toset(local.services)

  project = var.project_id
  service = each.value

  # Keep APIs enabled if this layer is ever destroyed; other tooling and the
  # prod layer depend on them.
  disable_on_destroy = false
}

# Remote state bucket for the prod layer (and any future layer). The bootstrap
# layer itself keeps local, committed state — it cannot use the bucket it
# creates.
resource "google_storage_bucket" "tfstate" {
  name     = "${var.project_id}-tfstate"
  project  = var.project_id
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Never let `terraform destroy` wipe Terraform state.
  force_destroy = false

  versioning {
    enabled = true
  }

  # Reap old state revisions so the bucket does not grow without bound.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
    }
    action {
      type = "Delete"
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.enabled]
}

# Dormant deploy identity. Created now so its email is stable; no IAM role
# bindings yet. Roles and the Workload Identity Federation binding land with the
# prod layer / the CI/CD topic (discussion 0003's follow-up).
resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "deployer"
  display_name = "Terraform / CI deployer (dormant - no role bindings yet)"

  depends_on = [google_project_service.enabled]
}
