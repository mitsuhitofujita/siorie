provider "google" {
  project = var.project_id
  region  = var.region
}

# APIs enabled here cover the bootstrap layer itself, the platform / app layers
# (Cloud Run, Artifact Registry, Firestore) and the GitHub Actions + Workload
# Identity Federation deploy path (sts, iamcredentials). Enabling is free and
# idempotent, so the whole known set is turned on in one place; each consuming
# layer documents which of these it actually uses.
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
  # platform / app layers depend on them.
  disable_on_destroy = false
}

# Remote state bucket for the platform and app layers (and any future layer).
# The bootstrap layer itself keeps local, committed state — it cannot use the
# bucket it creates.
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

# Deploy identity for GitHub Actions. Created dormant in worklog 0011 so its
# email was stable; discussion 0029 wired it up. This layer decides *who may
# become* deployer (the Workload Identity Federation binding below) and which
# Terraform state it may touch (the conditional bucket binding below). *What*
# deployer may do to the project — push images, roll the Cloud Run service —
# is granted in infra/platform/, next to the resources those roles apply to.
# No key is ever issued for this account.
resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "deployer"
  display_name = "GitHub Actions deployer (infra/app via Workload Identity Federation)"

  depends_on = [google_project_service.enabled]
}

# --- GitHub Actions → deployer (discussion 0029) ------------------------------
# GitHub's OIDC token for a workflow run is exchanged at this pool (STS) and
# then used to impersonate `deployer` (iamcredentials). Both APIs are enabled
# above. Only the repository named in var.github_repository, and only runs on
# its main branch, pass the provider's attribute condition — anything else is
# rejected before IAM is even consulted.
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "Identities for GitHub Actions workflow runs of this project's repository (OIDC)."

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  # google.subject is mandatory. repository is what the IAM binding below keys
  # on; ref is mapped so the condition can pin the branch.
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Forks and non-main branches fail here. A workflow_dispatch from a job that
  # uses a GitHub Environment still carries ref = refs/heads/<branch>.
  attribute_condition = "assertion.repository == \"${var.github_repository}\" && assertion.ref == \"refs/heads/main\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Lets any identity in the pool whose attribute.repository matches the
# repository impersonate deployer. The pool's .name already carries the project
# number (projects/<number>/locations/global/workloadIdentityPools/github), so
# no google_project data source is needed to build the principalSet.
resource "google_service_account_iam_member" "deployer_workload_identity_user" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Read/write on the infra/app state only. The bucket has uniform bucket-level
# access, so an object-name IAM condition is honoured; the platform/ state (and
# the local bootstrap state) stay out of deployer's reach.
resource "google_storage_bucket_iam_member" "deployer_app_state" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.deployer.email}"

  condition {
    title       = "app-layer-state-only"
    description = "Objects under the infra/app state prefix only (discussion 0029)."
    expression  = "resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.tfstate.name}/objects/app/\")"
  }
}

# storage.objects.list is checked against the bucket, not an object, so the
# object-name condition above can never grant it — yet `terraform init` lists
# the bucket (prefix "app") to enumerate workspaces (the GCS backend's
# Workspaces()). legacyBucketReader is the smallest predefined role that
# carries objects.list without objects.get: deployer can see every object
# *name* in the bucket (platform/default.tfstate is not a secret) but still
# reads and writes only under app/. The Cloud Storage "objectListPrefix" API
# attribute would scope listing to a prefix, but it is only supported in
# Credential Access Boundaries, not in role bindings (worklog 0017).
resource "google_storage_bucket_iam_member" "deployer_state_list" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.deployer.email}"
}
