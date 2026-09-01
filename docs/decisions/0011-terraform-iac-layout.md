# 0011: Terraform IaC layout — flat bootstrap + prod layers, committed bootstrap state

Discussion: [Terraform GCP bootstrap](../discussions/0022-terraform-gcp-bootstrap/proposal.md)
Worklog: [Terraform GCP bootstrap layer](../worklogs/0011-terraform-gcp-bootstrap/plan.md)

## Status

Superseded in part by
[0014](0014-infra-deploy-layers-and-firestore.md) (2026-09-01): the flat
`bootstrap` + `prod` split and the "factor out only on a second environment or
real reuse" rule are replaced by a three-layer split by change frequency
(`bootstrap` / `platform` / `app`). Everything else below — committed bootstrap
state, the hand-created project, workstation apply, no service-account keys, the
bootstrap layer's contents — is unchanged and still in force.

Originally: Accepted. Settled the two items the
[initial tech-stack proposal](../discussions/0001-purpose-and-initial-tech-stack/proposal.md)
left open — the range of resources Terraform manages and where state lives.
The CI/CD service selection parked in
[discussion 0003](../discussions/0003-cicd-service-selection/proposal.md) is
**not** settled here; only a non-binding direction is recorded (see below).

## Decision

Infrastructure as Code for Google Cloud lives under `infra/`, managed with
Terraform, applied from a workstation (no CI/CD automation yet), targeting a
single production project.

- **Two flat root modules: `infra/bootstrap/` and `infra/prod/`.** No
  `modules/`, no `environments/` wrapper. Structure is factored out only when a
  second environment or real reuse exists, per
  [0001](0001-monorepo-scaffold.md)'s no-speculative-structure rule.

- **State.** `infra/bootstrap/` keeps local state, committed to the repository:
  it is the layer that creates the state bucket, so it cannot back itself with
  that bucket, and its state holds only non-secret facts (which APIs are
  enabled, the bucket, a service-account identity) that double as a record of
  what exists in the project. `infra/prod/` uses a GCS backend in the bucket
  bootstrap creates (`prefix = "prod"`). Committed bootstrap state is viable
  only while a single operator applies locally; a second operator or CI touching
  bootstrap is the trigger to move bootstrap onto the GCS backend too.

- **`infra/bootstrap/` owns three things:** project API enablement for the
  known set that bootstrap, the near-future prod layer, and the planned CI/CD
  path all need (enabling is free and idempotent, so it is done once here and
  the prod layer documents which APIs it actually consumes); the Terraform
  state bucket (`<project_id>-tfstate`, `asia-northeast1`, versioned, uniform
  bucket-level access, public access prevention enforced, `prevent_destroy`, a
  30-day noncurrent-version cleanup rule); and a dormant `deployer` service
  account with **no** IAM role bindings.

- **`infra/prod/` is a skeleton** — zero managed resources for now, existing
  only to prove the GCS backend connects. Cloud Run, Artifact Registry, the
  Firestore `(default)` database, a runtime service account and its IAM, the
  billing budget and alert, and Cloud Monitoring come in later worklogs.

- **The GCP project is created by hand**, not by Terraform. Local apply uses the
  operator's own credentials (Application Default Credentials, or an equivalent
  short-lived user OAuth token); no service-account keys are issued, per
  [0001](0001-monorepo-scaffold.md).

- **Tooling.** `infra/justfile` carries `init` / `plan` / `apply` / `output`
  recipes that take the layer name and are reachable from the repo root
  (`just infra/plan bootstrap`). `mise.toml` pins `terraform` to an exact
  version; both layers pin the `google` provider (`~> 6.50`) with committed lock
  files. `just format` / `just check` run `terraform fmt` over `infra/`.

- **CI/CD direction (not a decision).** Future CI/CD leans toward GitHub Actions
  + Workload Identity Federation: bootstrap pre-enables `sts` and
  `iamcredentials` and holds the dormant `deployer` service account so a WIF
  pool and role bindings can be added later without reshaping bootstrap. The
  actual service selection stays open in discussion 0003.

## Rationale

The bootstrap/prod split with committed bootstrap state resolves the
chicken-and-egg — the layer that creates the state bucket cannot use it — in
the plainest way available, and the committed state file is a useful by-product
rather than a liability while only one person applies. Pre-creating the
`deployer` identity now fixes its email without granting it anything or
introducing a key. Keeping prod empty defers the parts that carry real design
weight (Firestore import, runtime-SA scope, budget resources) to their own
worklogs while still exercising the remote backend end to end.
