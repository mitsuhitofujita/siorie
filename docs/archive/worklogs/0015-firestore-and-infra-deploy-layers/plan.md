---
date: 2026-09-01
status: merged
discussions: [0027-firestore-and-infra-deploy-layers]
decisions: [0014-infra-deploy-layers-and-firestore]
pr: null
---

# Split infra/ into bootstrap / platform / app and add Firestore

Implements [discussion 0027](../../discussions/0027-firestore-and-infra-deploy-layers/proposal.md):
re-cut `infra/` into three root modules by change frequency
(`bootstrap` / `platform` / `app`, `prod` retired), add the Firestore
`(default)` database and `roles/datastore.user` on the runtime SA to the
`platform` layer, and move the four already-applied resources into the new
layers by `import` (never destroy/recreate).

Agent scope: write the files, update `infra/justfile` comments, run
`fmt` / `validate` / `plan` for both new layers. `apply`, the connectivity
check, and the `infra/prod/` teardown are operator steps (the auto-mode
classifier blocks `terraform apply` for the non-bootstrap layers — worklogs
0012, 0013).

## Preflight (checked before starting, 2026-09-01)

Same discipline as worklogs 0011 / 0012 / 0013.

| Check | State |
| --- | --- |
| `gcloud` account / project | `mitsuhitofujita@gmail.com` / `siorie` |
| ADC for `terraform` | present — `~/.config/gcloud/application_default_credentials.json` |
| `firestore.googleapis.com` enabled | yes (bootstrap `google_project_service.enabled`) |
| Firestore `(default)` database | **does not exist** — `gcloud firestore databases list` returns 0 items. Create fresh, no `terraform import`. |
| AR repository `siorie` (`asia-northeast1`) | live — `goog-terraform-provisioned: true`, KEEP-only policy, `cleanupPolicyDryRun: true`. Created `2026-08-30T07:46`. |
| image tag for the `app` plan | `app:e28e643b6768` — the only tag in AR (worklog 0012). Passed as `-var image_tag=`. |
| runtime SA `siorie-run@siorie.iam.gserviceaccount.com` | live, no role bindings |
| Cloud Run service `siorie` | live at `https://siorie-u6y3wdsaua-an.a.run.app`, `serviceAccountName = siorie-run@…` |
| invoker binding | live — `roles/run.invoker` → `allUsers` on the service |
| `infra/prod/` state contents | `terraform state list` → `data.google_project.this`, `google_artifact_registry_repository.app`, `google_cloud_run_v2_service.app`, `google_cloud_run_v2_service_iam_member.public`, `google_service_account.runtime` |
| provider `google_firestore_database` schema (6.50.0) | `delete_protection_state` (string, optional/computed — GCP-side guard), `deletion_policy` (string, optional — Terraform-only, assumed default `DELETE` — **wrong, `plan` resolved `ABANDON`; see Difficulties**), `point_in_time_recovery_enablement` (string, optional). Confirmed via `terraform providers schema -json`. |
| data sources exist in 6.50.0 | `google_project` (`.number`), `google_artifact_registry_repository` (`location` + `repository_id` required; yields `.project`), `google_service_account` (`account_id` required; yields `.email`). Confirmed via schema dump. |

## Plan

### `infra/platform/` (new, `prefix = "platform"`)

- `versions.tf` — `terraform ~> 1.15`, `google ~> 6.50` (copied from the other layers).
- `backend.tf` — `gcs`, `bucket = "siorie-tfstate"`, `prefix = "platform"`.
- `main.tf`:
  - `provider "google"` (project/region from vars).
  - `import` block → `google_artifact_registry_repository.app`,
    id `projects/siorie/locations/asia-northeast1/repositories/siorie`.
  - `import` block → `google_service_account.runtime`,
    id `projects/siorie/serviceAccounts/siorie-run@siorie.iam.gserviceaccount.com`.
  - `google_artifact_registry_repository.app` — verbatim from `infra/prod/main.tf`
    (`repository_id = "siorie"`, `DOCKER`, `location = var.region`,
    `cleanup_policy_dry_run = true`, KEEP `keep-recent` / `keep_count = 2`).
    DELETE policy + `dry_run = false` still deferred, now to this layer.
  - `google_service_account.runtime` — `account_id = "siorie-run"`,
    `display_name` reworded to drop "no role bindings yet" (a role binding
    lands in this same layer). This is an in-place `~ display_name` update on
    import, not a replace.
  - `google_firestore_database.default` — `name = "(default)"`,
    `location_id = var.region`, `type = "FIRESTORE_NATIVE"`,
    `app_engine_integration_mode = "DISABLED"`,
    `delete_protection_state = "DELETE_PROTECTION_ENABLED"` (GCP-side),
    `lifecycle { prevent_destroy = true }` (Terraform-side). PITR left at the
    default (disabled). No security-rules / composite-index resources.
  - `google_project_iam_member.runtime_datastore` — `role = "roles/datastore.user"`,
    `member = "serviceAccount:${google_service_account.runtime.email}"`.
- `variables.tf` — `project_id` (no default), `region` (default `asia-northeast1`).
  No further default-less variables, so a bare `just infra/plan platform` works.
- `terraform.tfvars` — `project_id = "siorie"`, `region = "asia-northeast1"` (committed).
- `outputs.tf` — `artifact_registry_repository` (same expression as the old
  `infra/prod/outputs.tf`).
- `.terraform.lock.hcl` — from `terraform init`, committed.

### `infra/app/` (new, `prefix = "app"`)

- `versions.tf`, `backend.tf` (`prefix = "app"`), `provider "google"`.
- `main.tf`:
  - `data "google_project" "this"` — `.number` for the built `APP_ORIGIN`.
  - `data "google_artifact_registry_repository" "app"` — `location = var.region`,
    `repository_id = "siorie"`; used to build the image path.
  - `data "google_service_account" "runtime"` — `account_id = "siorie-run"`;
    `.email` for `template.service_account`.
  - `import` block → `google_cloud_run_v2_service.app`,
    id `projects/siorie/locations/asia-northeast1/services/siorie`.
  - `import` block → `google_cloud_run_v2_service_iam_member.public`,
    id `projects/siorie/locations/asia-northeast1/services/siorie roles/run.invoker allUsers`.
  - `google_cloud_run_v2_service.app` — verbatim from `infra/prod/main.tf`
    except the three cross-references now resolve through `data` sources
    (image path, `service_account`, `APP_ORIGIN` project number). Every
    resolved string is byte-identical to what `infra/prod/` produces, so the
    import diff should be empty apart from the known `GOOGLE_CLIENT_ID`
    dummy-vs-real artifact (worklog 0013).
  - `google_cloud_run_v2_service_iam_member.public` — verbatim
    (`roles/run.invoker` → `allUsers`), still referencing the managed service's
    `.name`.
- `variables.tf` — `project_id` (no default), `region` (default), `image_tag`
  (`string`, no default), `google_client_id` (`string`, no default — non-secret
  but kept out of the repo, per 0024 / 0026).
- `terraform.tfvars` — `project_id` / `region` only.
- `outputs.tf` — `cloud_run_url = google_cloud_run_v2_service.app.uri`.
- `.terraform.lock.hcl` — committed.

### `infra/prod/`

**Left untouched in this commit.** Its removal is proposal step 9, an operator
step that only makes sense *after* they have run `terraform -chdir=infra/prod
state rm …` (proposal step 8, never `destroy`), which in turn needs the
`infra/prod/` directory (its `backend.tf` and initialised `.terraform/`) still
present. So this commit ships three coexisting layers; `infra/prod/` and the
`import` blocks are dropped together in the post-apply follow-up commit.

### `infra/justfile`

Comments only; the `init` / `plan` / `apply` / `output` recipes already take a
layer name and need no change.

- Layer list `(bootstrap, prod)` → `(bootstrap, platform, app)`.
- `image` comment: repository lives in `infra/platform/` now.
- `plan` / `apply` doc-comment examples: `prod` → `app`.
- "Roll the Cloud Run service" block: `just infra/apply prod …` → `… app …`;
  note the apply order (`platform` before `app` when both change, since `app`
  reads `platform`'s resources through `data` sources with no cross-module
  `depends_on`).
- `publish-image` prerequisite: `just infra/apply prod` → `just infra/apply platform`.

### Not touched here

- `docs/design/repository-structure.md` and decision 0011 — deferred to
  `/decide`, matching how the earlier infra worklogs (0011–0013) left the design
  doc for decide-time. See Difficulties.
- `APP_ORIGIN` real-URL fix — discussion 0025, still open.
- Budget / monitoring / AR DELETE cleanup policy — 0024's follow-ups, expected
  to land in `platform` later.

## Progress

### Files written

- `infra/platform/versions.tf`, `infra/platform/backend.tf`,
  `infra/platform/main.tf`, `infra/platform/variables.tf`,
  `infra/platform/terraform.tfvars`, `infra/platform/outputs.tf`,
  `infra/platform/.terraform.lock.hcl` — as planned. `main.tf` opens with a
  `# --- 0027 migration ---` … `# --- end 0027 migration ---` fenced comment
  wrapping the two `import` blocks, spelling out that they are removed in the
  follow-up commit.
- `infra/app/versions.tf`, `infra/app/backend.tf`, `infra/app/main.tf`,
  `infra/app/variables.tf`, `infra/app/terraform.tfvars`,
  `infra/app/outputs.tf`, `infra/app/.terraform.lock.hcl` — as planned. Same
  `# --- 0027 migration ---` fence around its two `import` blocks.
- `infra/justfile` — comment-only edits listed above; recipes unchanged.
- `infra/prod/` — left in place (see above); removed in the follow-up commit.
- `.gitignore` — `platform` and `app` `*.tfstate*` lines added next to the
  existing `prod` ones (defensive; all three are GCS-backed and should never
  write local state). The `prod` lines go when `infra/prod/` does.
- `docs/discussions/0027-firestore-and-infra-deploy-layers/discovery.md` —
  frontmatter `status: proposed → worked`,
  `worklogs: [] → [0015-firestore-and-infra-deploy-layers]` (bidirectional link).

### Checks run locally

- `terraform fmt -recursive infra/` — rewrote nothing (the new files were
  already canonical); `terraform fmt -recursive -check infra/` — clean.
- `terraform -chdir=infra/platform init` — created `prefix = "platform"` state
  (empty) and the committed lock file; provider `6.50.0` resolved from cache,
  lock hashes match the other layers.
- `terraform -chdir=infra/platform validate` — Success.
- `terraform -chdir=infra/platform plan` — see result below.
- `terraform -chdir=infra/app init` / `validate` / `plan -var image_tag=e28e643b6768 -var google_client_id=<dummy>`
  — see result below.

### terraform plan result — `infra/platform`

`Plan: 2 to import, 2 to add, 2 to change, 0 to destroy.` No `-/+` (replace)
anywhere. `terraform validate` — Success. Lock file byte-identical to the other
two layers.

| Resource | Action | Notes |
| --- | --- | --- |
| `google_artifact_registry_repository.app` | import + `~` in-place | Only change: `terraform_labels` gains `goog-terraform-provisioned = "true"` (already present in `effective_labels`; provider mirrors it into `terraform_labels` on import). Cosmetic, no API call of consequence. All real attributes match. |
| `google_service_account.runtime` | import + `~` in-place | Only change: `display_name` `"siorie Cloud Run runtime (no role bindings yet)"` → `"siorie Cloud Run runtime"` — the intended reword. |
| `google_firestore_database.default` | `+` create | `name = "(default)"`, `location_id = "asia-northeast1"`, `type = "FIRESTORE_NATIVE"`, `app_engine_integration_mode = "DISABLED"`, `delete_protection_state = "DELETE_PROTECTION_ENABLED"`, `point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"` (resolved default). **`deletion_policy` resolved to `"ABANDON"`** — the provider's default for this resource, not `"DELETE"` as the plan.md draft assumed. See Difficulties. |
| `google_project_iam_member.runtime_datastore` | `+` create | `role = "roles/datastore.user"`, `member = "serviceAccount:siorie-run@siorie.iam.gserviceaccount.com"`. |

`Changes to Outputs: + artifact_registry_repository = "asia-northeast1-docker.pkg.dev/siorie/siorie"`.

### terraform plan result — `infra/app`

Run with `-var image_tag=e28e643b6768 -var google_client_id=<dummy>`.
`Plan: 2 to import, 0 to add, 1 to change, 0 to destroy.` No `-/+`. `validate` —
Success.

| Resource | Action | Notes |
| --- | --- | --- |
| `google_cloud_run_v2_service.app` | import + `~` in-place | Four sub-changes, all cosmetic or state-only: (1) `deletion_protection = true -> false` — the field is client-side only, import can't read it back so it defaults to `true`; live service has `deletionProtection: None` (confirmed via the v2 API), so this only writes `false` into the new state. (2) `terraform_labels` gains `goog-terraform-provisioned` — same as platform. (3) a schema-visible top-level `scaling {}` block (`manual_instance_count = 0`, `min_instance_count = 0`, `scaling_mode = null`) is removed because the config declares none — all-zero, no behaviour change. (4) `GOOGLE_CLIENT_ID` env flips real → dummy — the worklog 0013 artifact; it disappears when the operator applies with the real client ID. `APP_ORIGIN`, `FIRESTORE_PROJECT_ID`, image path, `template.scaling` (max 1 / min 0), ports — all match, no diff. |
| `google_cloud_run_v2_service_iam_member.public` | import, no diff | `role = roles/run.invoker`, `member = allUsers`. Clean import. |

`Changes to Outputs: + cloud_run_url = "https://siorie-u6y3wdsaua-an.a.run.app"`
(the real URL, read back on import).

### Left to the operator

`terraform apply` for the non-bootstrap layers is blocked by the auto-mode
classifier (worklogs 0012, 0013), so the operator runs:

1. **`just infra/apply platform`** (no `-var` flags). Imports the AR repo and
   runtime SA, creates the Firestore `(default)` database and
   `roles/datastore.user`. Eyeball the plan: it must still be `2 import / 2 add
   / 2 change / 0 destroy` with **no replace**. If anything shows `-/+`, stop.
2. **`just infra/apply app -var image_tag=e28e643b6768 -var google_client_id=<real OAuth Web client ID>`**
   — the real ID is the `618741051931-…apps.googleusercontent.com` value the
   operator applied in worklog 0013 (non-secret, already in the live Cloud Run
   env, but kept out of the repo per 0024 / 0026; read it from the live service
   or the operator's shell history). Imports the Cloud Run service and the
   invoker binding. With the real client ID the `GOOGLE_CLIENT_ID` diff
   vanishes; the remaining in-place changes are the cosmetic ones above. No
   replace.
3. **Re-plan both** — `just infra/plan platform` and
   `just infra/plan app -var image_tag=e28e643b6768 -var google_client_id=<real ID>`
   → both "No changes".
4. **Connectivity check** —
   `curl -i "$(terraform -chdir=infra/app output -raw cloud_run_url)/api/hello"`
   → `200` JSON. Optionally exercise a Firestore-backed route (dev-login, then
   `/api/me`) now that `roles/datastore.user` is granted.
5. **Retire `infra/prod/`** —
   `terraform -chdir=infra/prod state rm google_artifact_registry_repository.app google_service_account.runtime google_cloud_run_v2_service.app google_cloud_run_v2_service_iam_member.public`.
   **Never `terraform destroy`** — the live resources belong to the new layers
   now. `data.google_project.this` can be left; it drops with the directory.
6. **Follow-up commit** — delete `infra/prod/`, delete the four `import` blocks
   from `infra/platform/main.tf` and `infra/app/main.tf`, drop the
   `/infra/prod/*.tfstate*` lines from `.gitignore`. Optionally
   `gcloud storage rm -r gs://siorie-tfstate/prod/` (harmless if left —
   versioned, 30-day noncurrent cleanup).

## What was done

Agent side (code + local verification) — complete:

- Created `infra/platform/` (`versions.tf`, `backend.tf` `prefix = "platform"`,
  `main.tf`, `variables.tf`, `terraform.tfvars`, `outputs.tf`,
  `.terraform.lock.hcl`): `provider`, two `import` blocks (AR repo, runtime SA),
  `google_artifact_registry_repository.app` (verbatim from `infra/prod/`),
  `google_service_account.runtime` (display name reworded),
  `google_firestore_database.default` (Native, `asia-northeast1`, GCP-side
  delete protection + `prevent_destroy`), `google_project_iam_member.runtime_datastore`
  (`roles/datastore.user`). `outputs.tf` exposes `artifact_registry_repository`.
- Created `infra/app/` (same file set, `backend.tf` `prefix = "app"`): `provider`,
  two `import` blocks (Cloud Run service, invoker), `data` sources
  (`google_project`, `google_artifact_registry_repository`, `google_service_account`),
  `google_cloud_run_v2_service.app` (verbatim from `infra/prod/` except the
  three cross-references now go through the `data` sources — every resolved
  string identical), `google_cloud_run_v2_service_iam_member.public` (verbatim).
  `variables.tf` keeps `image_tag` / `google_client_id` as default-less `-var`s.
  `outputs.tf` exposes `cloud_run_url`.
- `infra/justfile` — comment-only edits: layer list `(bootstrap, prod)` →
  `(bootstrap, platform, app)` with a per-layer frequency/state note and the
  "apply platform before app" rule; `plan`/`apply` doc examples `prod` → `app`;
  "Roll the Cloud Run service" block `prod` → `app` + "platform and bootstrap
  take no -var flags"; `publish-image` prerequisite `just apply prod` →
  `just infra/apply platform`. Recipes unchanged.
- `.gitignore` — added `/infra/platform/*.tfstate*` and `/infra/app/*.tfstate*`
  next to the existing `/infra/prod/*` lines.
- `infra/prod/` — left intact (its removal needs the operator's `state rm`
  first; see the "Left to the operator" step 5–6).
- `docs/discussions/0027-firestore-and-infra-deploy-layers/discovery.md` —
  `status: proposed → worked`, `worklogs: [0015-firestore-and-infra-deploy-layers]`.
- Verified locally, no cloud mutation beyond `init` creating two empty state
  objects: `terraform fmt -recursive -check infra/` clean; `validate` Success
  for both layers; lock files identical to `bootstrap`/`prod`; `platform` plan
  `2 import / 2 add / 2 change / 0 destroy`; `app` plan
  `2 import / 0 add / 1 change / 0 destroy`; no replace in either; `infra/prod/`
  state still lists all five entries; `just --dry-run` expands the new layer
  names correctly.

Operator side (`apply` + connectivity check + `infra/prod/` retirement) —
**pending.**

## Difficulties

The migration itself went as the proposal modelled it — every import planned as
import, nothing as replace. Three things diverged from what the plan.md draft or
the proposal assumed; the Firestore `deletion_policy` one is the most useful.

### `google_firestore_database.deletion_policy` defaults to `ABANDON`, not `DELETE`

The plan.md preflight table, reading only `terraform providers schema -json`
(which shows `deletion_policy` as `optional`, no default surfaced), recorded
"Terraform-only, default `DELETE`". The actual `plan` resolved
`+ deletion_policy = "ABANDON"`. Provider `hashicorp/google` 6.50.0 defaults
this resource's `deletion_policy` to `ABANDON`: on `terraform destroy` the
database is dropped from state and **left live**, not deleted.

Net effect: the `(default)` database is guarded three ways, not the two the
proposal specified —
`delete_protection_state = "DELETE_PROTECTION_ENABLED"` (API refuses deletion),
`lifecycle { prevent_destroy = true }` (plan errors on destroy/replace), and
`deletion_policy = "ABANDON"` (even past the other two, `destroy` abandons
rather than deletes). This is strictly safer than intended, so it is left as the
provider resolves it and not pinned explicitly. Worth pinning `= "ABANDON"`
explicitly later only if a provider-major bump might change the default; noted,
not acted on.

### A fresh `import` surfaces cosmetic diffs that the original `apply` never showed

Worklog 0013 recorded that a re-`plan` of `infra/prod/` (same `-var`s) is "No
changes". A first reading of that is "the resources are inert, import will be a
pure no-op". The `plan` for the new layers shows that is not quite true: because
`import` re-reads the whole object from the API, the provider pulls in fields
the create-time apply never tracked and then wants to reconcile them to config:

- `terraform_labels` gains `goog-terraform-provisioned = "true"` on both the AR
  repo and the Cloud Run service (the label is real and already in
  `effective_labels`; only the `terraform_labels` mirror is "missing").
- `google_cloud_run_v2_service.deletion_protection` reads back as `true` (the
  field is client-side only — the live service has `deletionProtection: None`
  in the v2 API — so import cannot recover the `false` that `infra/prod/` holds
  in state) and plans `true -> false`.
- A schema-visible top-level `scaling {}` block on the Cloud Run service
  (`manual_instance_count = 0`, `min_instance_count = 0`) is planned for removal
  because the config declares none.

None of these is a replace and none changes live infrastructure — they are
one-time state normalizations that settle after the operator's first `apply`,
after which a re-plan is clean (matching `infra/prod/` today). But they mean the
operator's apply plan will read as "1 change" on the Cloud Run service and
"2 change" on platform, not "0 change"; the worklog spells out each line so the
operator can green-light it rather than stop.

### The live Cloud Run service has a service-level `scaling.maxInstanceCount = 20` that Terraform cannot see

While confirming the `deletion_protection` behaviour, the v2 API showed the
service carries a top-level `scaling: {maxInstanceCount: 20}` (and a matching
`run.googleapis.com/maxScale: '20'` annotation). This was never set by
`infra/prod/` — the config only has `template.scaling { max 1 / min 0 }`, which
the revision does honour (`revision.scaling.maxInstanceCount = 1`). Provider
6.50's `google_cloud_run_v2_service` top-level `scaling` block schema has no
`max_instance_count` field, so Terraform neither reads nor manages this value;
the migration leaves it untouched at 20. Origin unknown (a Cloud Run default for
the service-level object, or a manual console tweak after 0013). Flagged as an
observation only — it predates this change, is invisible to the config either
way, and the per-revision cap that actually bounds instances is 1 as intended.

### `docs/design/repository-structure.md` and decision 0011 not updated here

Proposal migration step 1 mentions the design-doc update as "worklog side". This
worklog does **not** touch `docs/design/repository-structure.md` or supersede
decision 0011, for two reasons: (a) the earlier infra worklogs (0011–0013) all
left the design doc for `/decide` time — decision 0011's "flat two layers" is
still what the design doc cites, and rewriting the design to "three layers"
while its linked decision says the opposite would be internally inconsistent
until `/decide` resolves it; (b) until the operator applies, the live project is
still `prod`-shaped, so "current state" in the design doc has not actually
changed yet. The design rewrite and the new decision (add change-frequency /
blast-radius as a factor-out trigger, retire the flat-two-layer rule, record
`prod` → `platform` + `app`) are queued for `/decide`, consistent with the
proposal's own "申し送り" section.

## Review

Two of the difficulties are worth a second look; neither is a one-off accident,
but I do not think either needs a fresh `discovery.md` — they are the operator's
call. **Operator's call (2026-09-01): no new discovery for either; the worklog
record here is enough.**

### `import`-surfaced cosmetic drift is a property of the "all-import migration" choice

Discussion 0027 chose "new prefixes + full `import`" over "reuse the `prod`
prefix" specifically for a clean state layout, accepting the import risk. The
plan shows the risk landed in its mildest form (cosmetic in-place, no replace),
but it also shows that "re-plan is clean" for an existing state does **not**
guarantee "import is a zero-diff no-op" for the same resources. That is a
generalizable lesson for the next import-based migration (CI/CD moving the
`deployer` SA bindings, or any future layer reshuffle), not a defect in this
one. If the pattern recurs, a short discovery on "how to pre-empt import
normalization diffs" (provider `ignore_changes`, `-refresh-only` first, or
accepting the one-time settle) would be worth writing — but one occurrence is
not yet that.

### The predictive value of `terraform providers schema -json` is limited

The `deletion_policy` default was invisible to the schema dump and only appeared
at `plan` time. The preflight leaned on the schema dump to avoid an apply-time
surprise (the same discipline worklogs 0011–0013 adopted after 0011's apply
broke on an unchecked premise). It caught the resource/attribute existence
questions but not resolved defaults. For future infra worklogs the takeaway is
"schema dump for existence, `plan` for resolved values" — a process note for the
next agent, not a design distortion. No discovery needed.
