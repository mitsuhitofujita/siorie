# 0014: Infra deploy layers by change frequency, and the Firestore (default) database

Discussion: [Firestore and infra deploy layers](../discussions/0027-firestore-and-infra-deploy-layers/proposal.md)
Worklog: [Split infra/ into bootstrap / platform / app and add Firestore](../worklogs/0015-firestore-and-infra-deploy-layers/plan.md)

## Status

Accepted. Supersedes the flat two-layer structure and the "factor out only on a
second environment or real reuse" rule of
[0011](0011-terraform-iac-layout.md); the rest of 0011 (the `bootstrap` layer,
committed bootstrap state, hand-created project, workstation apply, no
service-account keys) stands unchanged.

Rollout is mid-flight: the layer files and their verified `plan`s are committed,
but the operator's first `apply` of `platform` and `app`, and the removal of
`infra/prod/`, are still pending — see the worklog.

## Decision

- **`infra/` is three root modules split by how often each changes**, not by
  environment:
  - `bootstrap/` — almost never; local committed state (unchanged from 0011).
  - `platform/` — rarely; `gs://siorie-tfstate/platform`. Artifact Registry
    repository, Firestore `(default)` database, the `siorie-run` runtime service
    account, and `roles/datastore.user` on it.
  - `app/` — every deploy; `gs://siorie-tfstate/app`. The Cloud Run service and
    its `allUsers` invoker binding.
  - `infra/prod/` is retired. Its four live resources move into the new layers
    by `terraform import` (no destroy/recreate); the operator releases the old
    state with `state rm` (never `terraform destroy`) and the directory is
    deleted in a follow-up commit. `modules/` and `environments/` are still not
    introduced.

- **Change frequency / blast radius is now an accepted trigger for splitting a
  root module**, alongside 0001's second-environment and real-reuse triggers.
  The split is deliberately pre-emptive — no concrete operational pain yet — and
  the tension with 0001's no-speculative-structure rule is taken knowingly.

- **`app` reads `platform` through GCP `data` sources, not
  `terraform_remote_state`.** A plan in `app` then needs only ordinary project
  read access, no state-read permission or output wiring. There is no
  cross-module `depends_on`, so when both layers change, `platform` is applied
  first (noted in `infra/justfile`).

- **Per-deploy inputs stay out of the repo and live only in `app`.** `image_tag`
  and `google_client_id` remain default-less `-var`s; `bootstrap` and
  `platform` take no `-var` flags. This narrows discussion 0026's friction to
  `app` alone without resolving it, and 0025 (`APP_ORIGIN` still built from the
  project number, still wrong) is likewise untouched — it just becomes an
  `app`-local problem.

- **Firestore `(default)`**: `FIRESTORE_NATIVE`, single-region `asia-northeast1`
  (both permanent), App Engine integration disabled, point-in-time recovery off
  (cost). Deletion is guarded by GCP-side
  `delete_protection_state = DELETE_PROTECTION_ENABLED` and Terraform-side
  `lifecycle { prevent_destroy = true }`; the provider additionally defaults
  `deletion_policy` to `ABANDON`, so removing the database takes three
  deliberate steps. No security-rules or composite-index resources — all access
  is through the Go backend's ADC, never a client SDK.

## Rationale

The flat rule from 0011 fit while `prod` held one resource; it stops fitting
once the same layer mixes a Cloud Run service that rolls on every deploy with an
image repository and a database that essentially never change. Splitting by
change frequency scopes a routine deploy's plan and state to `app`, so a mistake
there cannot reach the database or the repository, and it later lets CI/CD hold
a tightly-scoped identity for `app` while `platform` stays human-only. Crossing
layers with `data` sources rather than remote state keeps each layer
independently plan-able with the credentials an operator already has. Firestore's
irreversible choices are made once and locked behind a triple delete-guard.

## Supersedes

- [0011: Terraform IaC layout](0011-terraform-iac-layout.md), in part — the flat
  `bootstrap` + `prod` split and the factor-out-trigger rule. The rest of 0011
  is unchanged.
