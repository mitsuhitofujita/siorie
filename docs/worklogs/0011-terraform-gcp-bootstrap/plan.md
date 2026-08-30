---
date: 2026-08-30
status: in-progress
discussions: [0022-terraform-gcp-bootstrap]
decisions: []
pr: null
---

# Terraform GCP bootstrap layer

Implements the bootstrap layer from
[discussion 0022](../../discussions/0022-terraform-gcp-bootstrap/proposal.md):
the `infra/` directory layout, the `infra/bootstrap/` root module (API
enablement + GCS state bucket + dormant deployer SA, local committed state),
and an `infra/prod/` skeleton (GCS backend, zero resources) to prove the
backend connects.

## Plan

1. `infra/bootstrap/` — `versions.tf`, `main.tf`, `variables.tf`, `outputs.tf`,
   `terraform.tfvars` (committed: `project_id`, `region`).
2. `infra/prod/` — `versions.tf`, `backend.tf` (GCS, `prefix = "prod"`),
   `variables.tf`, `terraform.tfvars`, `main.tf` (provider only, zero resources).
3. `infra/justfile` — thin `init` / `plan` / `apply` / `fmt` recipes taking the
   layer name; wired so `just infra/plan bootstrap` works from any directory.
4. `mise.toml` — pin `terraform` to an exact version.
5. `.gitignore` — ignore `.terraform/`, `infra/prod/*.tfstate*`, `*.tfplan`;
   keep `infra/bootstrap/terraform.tfstate` and both `.terraform.lock.hcl`
   tracked.
6. `terraform init` / `fmt` / `validate` both layers (no ADC needed).
7. `terraform apply` `infra/bootstrap/` against project `siorie` (needs the
   operator's ADC).
8. `terraform init` + `plan` `infra/prod/` against the new bucket.

## Environment observed before starting

- Terraform `v1.15.9` installed (mise pins `latest`; `1.16.0` exists upstream).
- `gcloud` authed as `mitsuhitofujita@gmail.com`, default project `siorie`
  (project number `618741051931`, `ACTIVE`).
- **ADC not configured** — `~/.config/gcloud/application_default_credentials.json`
  is missing. `terraform apply` will need `gcloud auth application-default login`
  run by the operator first.
- Project `siorie` already has these services enabled (relevant subset):
  `serviceusage`, `storage`, `logging`, `monitoring`, `datastore` (Firestore in
  Datastore-mode API), plus a batch of BigQuery / Dataform / Dataplex APIs that
  look like console defaults. **Not** enabled yet: `firestore`,
  `cloudresourcemanager`, `iam`, `iamcredentials`, `sts`, `run`,
  `artifactregistry`, `cloudbilling`, `billingbudgets`.
- No GCS buckets, no user-managed service accounts, no Firestore database.

## Progress

### Files written

- `infra/bootstrap/` — `versions.tf`, `main.tf`, `variables.tf`, `outputs.tf`,
  `terraform.tfvars`, plus the committed `.terraform.lock.hcl`.
  - `main.tf`: `google_project_service` (for_each over 13 APIs,
    `disable_on_destroy = false`); `google_storage_bucket.tfstate`
    (`<project_id>-tfstate`, `asia-northeast1`, UBLA, `public_access_prevention
    = "enforced"`, versioning on, a `days_since_noncurrent_time = 30` delete
    lifecycle rule, `prevent_destroy`); `google_service_account.deployer`
    (dormant, no bindings).
- `infra/prod/` — `versions.tf`, `backend.tf` (GCS, bucket `siorie-tfstate`,
  `prefix = "prod"`), `variables.tf`, `terraform.tfvars`, `main.tf` (provider
  only, zero resources), committed `.terraform.lock.hcl`.
  - Deviation from the proposal: the proposal said prod would hold "provider
    config only". Added `variables.tf` + `terraform.tfvars` too (mirroring
    bootstrap) so the provider block is not hardcoded and the next worklog has
    less churn. Still zero managed resources.
- `infra/justfile` — `init` / `plan` / `apply` / `output` recipes taking the
  layer name (via `terraform -chdir={{source_directory()}}/{{layer}}`, so
  caller-cwd-independent), plus `format` / `format-check`.
- Root `justfile` — `format` now also runs `just infra/format`; `check` now also
  runs `just infra/format-check`.
- `mise.toml` — `terraform = "latest"` → `terraform = "1.15.9"` (the version
  actually installed and used here; `1.16.0` exists upstream but was not used).
- `.gitignore` — ignore `**/.terraform/*`, `*.tfplan`, `infra/prod/*.tfstate*`;
  `infra/bootstrap/terraform.tfstate` and both `.terraform.lock.hcl` stay
  tracked.

### Terraform checks (no credentials needed)

- google provider resolved to `v6.50.0`. Constraint set to `~> 6.50` in both
  layers; lock files regenerated so `constraints` reads `~> 6.50`.
- `terraform fmt -recursive infra/` — clean.
- `terraform -chdir=infra/bootstrap validate` — Success.
- `terraform -chdir=infra/prod init -backend=false` + `validate` — Success.

### Apply attempt — blocked on billing

Credentials: ADC was not set up and `gcloud auth application-default login` is
interactive, so the plan/apply were run with
`GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"` — the operator's
own gcloud OAuth token, no service-account key, ~1 h lifetime. This is a
deviation from the proposal's documented path (ADC); it is fine for a one-off
apply, but the durable local-apply path should still be ADC.

`terraform -chdir=infra/bootstrap plan` was clean: **15 to add, 0 to change,
0 to destroy** (13 services + bucket + SA).

`terraform -chdir=infra/bootstrap apply -auto-approve` **failed partway**:

```
Error 400: Billing account for project '618741051931' is not found.
Billing must be enabled for activation of service(s)
'artifactregistry.googleapis.com' / 'run.googleapis.com' to proceed.
reason: UREQ_PROJECT_BILLING_NOT_FOUND
```

`gcloud billing projects describe siorie` → `billingEnabled: false`. **The
project has no billing account linked.** This contradicts the proposal's premise
that the project was already created by hand and linked to a billing account.

Partial state after the failed apply (Terraform is idempotent here, so this is
safe to leave and re-apply):

- Created (11 of 13 services): `serviceusage`, `cloudresourcemanager`, `iam`,
  `iamcredentials`, `sts`, `storage`, `firestore`, `cloudbilling`,
  `billingbudgets`, `monitoring`, `logging`.
- Not created (need billing): `artifactregistry.googleapis.com`,
  `run.googleapis.com`.
- Not created (apply errored before reaching them — they `depends_on` all
  services): `google_storage_bucket.tfstate`,
  `google_service_account.deployer`.

**Blocked. Next step is the operator's:** link a billing account —
`gcloud billing accounts list`, then
`gcloud billing projects link siorie --billing-account=<ACCOUNT_ID>` — then
re-run `terraform -chdir=infra/bootstrap apply`. `infra/prod` init + plan is
still pending on that.

### Unblocked — billing linked, apply completed

Operator linked billing account `01BF20-C6DA79-4FE3E2` to `siorie`
(`billingEnabled: true`). They had to shut down another project first: that
billing account had hit its project limit.

- `terraform -chdir=infra/bootstrap apply` — **4 added, 0 changed, 0 destroyed**
  (the two billing-gated services, the bucket, the SA). All 13 services now
  enabled.
- `terraform -chdir=infra/bootstrap plan` (re-run) — **No changes.**
- `terraform -chdir=infra/prod init` against `gs://siorie-tfstate` — backend
  configured successfully.
- `terraform -chdir=infra/prod plan` — **No changes.**
- `gs://siorie-tfstate/prod/default.tfstate` exists (prod state landed in the
  bucket).

### Connectivity check — all conditions met

| Condition | Result |
| --- | --- |
| `infra/bootstrap` apply succeeds against `siorie` | ok (4 added on the completing run) |
| target APIs enabled | ok — 13/13 (`gcloud services list --enabled`) |
| state bucket exists, versioned | ok — `siorie-tfstate`, `versioning_enabled: true`, `ASIA-NORTHEAST1`, UBLA, `public_access_prevention: enforced`, lifecycle Delete @ `daysSinceNoncurrentTime=30` |
| `infra/bootstrap` re-plan clean | ok — No changes |
| `infra/prod` init against the bucket | ok |
| `infra/prod` plan clean | ok — No changes |

### Operator-confirmed

The operator ran `just infra/apply bootstrap` themselves and confirmed the
recipe path works end-to-end (they resolved credentials on their side).

### Final state of the tree

`git add -n infra/` tracks exactly: both layers' `*.tf`, `terraform.tfvars`,
`.terraform.lock.hcl`; `infra/bootstrap/terraform.tfstate`; `infra/justfile`.
Excluded by `.gitignore`: `**/.terraform/`, `*.tfplan`,
`infra/bootstrap/terraform.tfstate.backup`, `infra/prod/*.tfstate*`.
`deployer@siorie.iam.gserviceaccount.com` has an empty IAM policy (no bindings),
as intended.

## What was done

- Added the `infra/` tree: `infra/bootstrap/` (root module, local committed
  state) and `infra/prod/` (root module, GCS backend, zero resources), plus
  `infra/justfile`.
- `infra/bootstrap/` enables 13 project services, creates the
  `siorie-tfstate` GCS bucket (versioned, UBLA, PAP enforced, 30-day
  noncurrent-version cleanup, `prevent_destroy`), and creates the dormant
  `deployer` service account with no role bindings.
- `infra/prod/` is a skeleton wired to the new bucket
  (`backend "gcs"`, `prefix = "prod"`); it exists only to prove the backend
  connects.
- Wired `infra/format` / `infra/format-check` into the root `just format` /
  `just check`.
- Pinned `terraform = "1.15.9"` in `mise.toml`; both layers constrain
  `google` to `~> 6.50` with committed lock files (resolved to `6.50.0`).
- `.gitignore`: ignore Terraform working dirs, plan files, prod state, and the
  bootstrap state backup; keep bootstrap state and both lock files tracked.
- Applied `infra/bootstrap/` to project `siorie` and verified the connectivity
  conditions above.

## Difficulties

### The project had no billing account linked (proposal premise did not hold)

The proposal stated as a premise that the project was "already created by hand
and linked to a billing account". It was created, but **billing was not
linked** (`billingEnabled: false`). This was not visible until `terraform apply`
tried to enable `run.googleapis.com` / `artifactregistry.googleapis.com`, which
fail with `UREQ_PROJECT_BILLING_NOT_FOUND` when billing is absent (GCS bucket
creation needs billing too). The apply therefore ran partway: 11/13 services
enabled, bucket and SA not created.

Root cause: the operator's five other projects are all linked to the same
billing account, because creating a project in the Cloud Console auto-links the
default billing account. `siorie` was created via a path that skipped that step,
so it was the only unlinked project — which is exactly why "do other projects
need this?" was a reasonable question and the answer was "they already have it,
invisibly".

Second-order friction: linking then failed because the billing account had
reached its **project limit**; the operator had to shut down another project to
free a slot before the link succeeded.

Why this matters for the design: the proposal treated "project exists + billing
linked" as an unchecked given, the same way it treated ADC — but unlike ADC it
was not called out as a preflight step. A partial apply against a real project
is a worse failure mode than a preflight check failing. Options for the prod
worklog: add a `data.google_project` + a `precondition` asserting billing is
enabled, or document an explicit preflight checklist (`gcloud billing projects
describe`, `gcloud auth application-default print-access-token`/ADC) next to the
`infra/justfile` recipes. This looks like a one-off setup gap rather than a
design distortion, but see "Review" below.

### ADC was not configured; used the operator's OAuth access token instead

The proposal's documented local-apply path is `gcloud auth
application-default login`. That is interactive and could not be run from here,
and `~/.config/gcloud/application_default_credentials.json` was absent. All
`plan`/`apply` calls were made with
`GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"` — the operator's
own gcloud user OAuth token, no service-account key, ~1 h lifetime. The
`google` provider picks this env var up directly.

Consequences:

- This is a keyless path and consistent with "no SA keys", but it is **not**
  what the proposal describes, and the token expires mid-session — a long apply
  could need it re-exported.
- The durable local path (ADC) is still not set up. `just infra/plan bootstrap`
  and friends will fail for the operator until they either run `gcloud auth
  application-default login` or export `GOOGLE_OAUTH_ACCESS_TOKEN` themselves.
  The `infra/justfile` recipes do not mention this; the credential requirement
  should be documented there or in a short `infra/README`.

### Minor

- **Lock-file `constraints` line lagged.** After tightening the version
  constraint from `~> 6.0` to `~> 6.50`, `terraform init` (even with
  `-upgrade`) kept `constraints = "~> 6.0"` in `.terraform.lock.hcl` because the
  selected version did not change. Deleting the lock file and re-running `init`
  produced a clean `constraints = "~> 6.50"`. Cosmetic — `version` + `hashes`
  are what enforce reproducibility.
- **GCS default soft-delete policy.** The new bucket automatically got a 7-day
  `soft_delete_policy` (`retentionDurationSeconds: 604800`) that the config does
  not declare. It does not cause plan drift (the provider does not manage it
  unless set) and is not billed at this size, but a future reader adding
  `soft_delete_policy` to the config should know it is already there.
- **prod skeleton is slightly larger than the proposal said.** The proposal
  said prod would carry "provider config only"; it also got `variables.tf` +
  `terraform.tfvars` mirroring bootstrap, so the provider block is not
  hardcoded. Still zero managed resources.

## Review

The billing-premise gap is the one difficulty that touches an assumption rather
than being a pure accident: the proposal assumed a linked billing account and
did not make it a checked preflight step, and the failure surfaced only as a
partial apply. It still reads as a one-off setup gap (the project simply missed
the auto-link the other five projects got), so a fix inside the prod worklog
(billing precondition or a documented preflight) is probably enough rather than
a new discovery. Flagging it for the operator to decide.

