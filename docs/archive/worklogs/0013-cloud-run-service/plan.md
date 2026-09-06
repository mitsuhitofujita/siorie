---
date: 2026-08-30
status: merged
discussions: [0024-cloud-run-service]
decisions: [0015-cloud-run-service]
pr: null
---

# Cloud Run service and dormant runtime SA in infra/prod/

Implements [discussion 0024](../../discussions/0024-cloud-run-service/proposal.md):
add the pieces that run the already-pushed Artifact Registry image on Cloud Run
to `infra/prod/`, so an operator can `apply` and confirm the assigned URL
returns some HTTP response. Firestore `(default)`, role bindings on the runtime
SA, SPA co-serving, the Artifact Registry DELETE cleanup policy, budget /
monitoring, and CI/CD automation are all out of scope and deferred.

## Plan

1. `infra/prod/main.tf` — add:
   - `data "google_project" "this"` — project number, for the built `APP_ORIGIN`.
   - `google_service_account.runtime` (`account_id = "siorie-run"`), **no role
     bindings** — dormant identity, mirroring `infra/bootstrap/`'s `deployer` SA.
   - `google_cloud_run_v2_service.app` — `name = "siorie"`,
     `deletion_protection = false`, `ingress = "INGRESS_TRAFFIC_ALL"`,
     `template.service_account` = runtime SA, `template.scaling` `min 0 / max 1`,
     one container from
     `<ar-path>/app:${var.image_tag}` on `container_port = 8080`, env
     `GOOGLE_CLIENT_ID` / `APP_ORIGIN` (built from the project number) /
     `FIRESTORE_PROJECT_ID`.
   - `google_cloud_run_v2_service_iam_member.public` — `roles/run.invoker` for
     `allUsers`.
   - Trim the trailing "coming later" comment.
2. `infra/prod/variables.tf` — `image_tag` and `google_client_id`, both `string`
   with no default.
3. `infra/prod/outputs.tf` — `cloud_run_url = google_cloud_run_v2_service.app.uri`.
4. `infra/justfile` — `plan` / `apply` recipes take `*args` and pass them
   through; add a deploy-step comment to the "Deploy container image" block.
5. `terraform fmt` → `validate` → `plan` (with `-var` for both new variables).
6. `apply` + connectivity check — **operator**, because `terraform apply` for
   `infra/prod/` is blocked by the Claude Code auto-mode classifier (seen in
   worklog 0012).

## Preflight (checked before starting)

Worklog 0011's apply broke on an unchecked premise, so 0012 and 0024 both carry
an explicit preflight list. State on this machine, 2026-08-30:

| Check | State |
| --- | --- |
| ADC for `terraform` (`infra/prod/`) | present — `~/.config/gcloud/application_default_credentials.json`, `quota_project_id = siorie` |
| `gcloud` account / project | `mitsuhitofujita@gmail.com` / `siorie` |
| billing linked | yes (worklog 0011) |
| `run.googleapis.com` enabled | yes — `gcloud services list --enabled` shows it (bootstrap, 0011) |
| image `app:<sha>` in Artifact Registry | yes — **one** tag, `app:e28e643b6768`, created 2026-08-30T16:49 (worklog 0012). No other tags. |
| current repo HEAD | `c06cc8f3b6e9` — **ahead of the pushed image**, but the three commits since `e28e643` are docs-only, so `app:e28e643b6768` is functionally current. See Difficulties. |
| Firestore `(default)` database | **does not exist** — `gcloud firestore databases list` returns nothing. Next round creates it fresh (`google_firestore_database`), no `terraform import` needed. |
| org policy blocking `allUsers` invoker | none — `gcloud organizations list` is empty (no org), and `constraints/iam.allowedPolicyMemberDomains` has no `listPolicy`/`booleanPolicy` rule. `allUsers` + `roles/run.invoker` should be accepted. |
| real `.uri` URL format (new vs legacy hash) | not checkable until apply — recorded as an operator step. |

## Progress

### Files written

- `infra/prod/main.tf` — appended, after the Artifact Registry resource:
  - `data "google_project" "this"` (`project_id = var.project_id`) — only the
    `.number` attribute is used, to build the service's own `run.app` origin.
  - `google_service_account.runtime` — `account_id = "siorie-run"`,
    `display_name = "siorie Cloud Run runtime (no role bindings yet)"`. No IAM
    bindings, no `depends_on` (the API-enable resource lives in
    `infra/bootstrap/`, not this layer — same as the existing AR resource, which
    only documents the dependency in a comment).
  - `google_cloud_run_v2_service.app` — `name = "siorie"`, `project`,
    `location = var.region`, `deletion_protection = false` (comment: provider
    6.x defaults it to `true`; the service holds no data), `ingress =
    "INGRESS_TRAFFIC_ALL"`. `template` block: `service_account` = the runtime
    SA email; `scaling { min_instance_count = 0, max_instance_count = 1 }`;
    one `containers` block with `image` built inline as
    `"${google_artifact_registry_repository.app.location}-docker.pkg.dev/${...project}/${...repository_id}/app:${var.image_tag}"`
    (same construction as `outputs.tf`'s `artifact_registry_repository`, plus
    `/app:<tag>`), `ports { container_port = 8080 }`, and three `env` blocks
    (`GOOGLE_CLIENT_ID` = `var.google_client_id`, `APP_ORIGIN` =
    `"https://siorie-${data.google_project.this.number}.${var.region}.run.app"`,
    `FIRESTORE_PROJECT_ID` = `var.project_id`). `PORT` is not set (Cloud Run
    injects it).
  - `google_cloud_run_v2_service_iam_member.public` — `project`,
    `location = var.region`, `name = google_cloud_run_v2_service.app.name`,
    `role = "roles/run.invoker"`, `member = "allUsers"`.
  - Replaced the old trailing "Coming in later worklogs: Cloud Run service,
    runtime service account + IAM, ..." comment with a trimmed one that drops
    what this worklog adds and keeps the rest (Firestore + `roles/datastore.user`,
    SPA co-serving, DELETE cleanup policy + `cleanup_policy_dry_run = false`,
    `APP_ORIGIN` → real `cloud_run_url`, budget + alert, Cloud Monitoring, CI/CD).
- `infra/prod/variables.tf` — appended `image_tag` and `google_client_id`, both
  `type = string` with **no default**. Descriptions state they must be passed
  with `-var` / `TF_VAR_` at plan/apply time.
- `infra/prod/outputs.tf` — appended `cloud_run_url` =
  `google_cloud_run_v2_service.app.uri`, description notes it is the
  connectivity-check target and the value to compare against the built
  `APP_ORIGIN`.
- `infra/justfile`:
  - `plan layer *args` / `apply layer *args`, passing `{{args}}` through to
    `terraform ... plan|apply`. `init` and `output` unchanged.
  - Recipe doc comments on `plan` / `apply` now show the
    `-var image_tag=<sha> -var google_client_id=<id>` form.
  - "Deploy container image" block: added a closing comment with the
    post-`publish-image` step
    (`just infra/apply prod -var image_tag=$(git rev-parse --short=12 HEAD) -var google_client_id=<id>`)
    and a note that every `prod` plan/apply now needs both `-var` flags.
- `docs/discussions/0024-cloud-run-service/discovery.md` — frontmatter
  `status: proposed → worked`, `worklogs: [] → [0013-cloud-run-service]`
  (bidirectional link).

### Checks run locally (no cloud mutation)

- `terraform fmt -recursive infra/` — no files rewritten (edits were already
  canonical); `terraform fmt -recursive -check infra/` — clean.
- `terraform -chdir=infra/prod validate` — Success.
- `just --dry-run infra/plan prod -var image_tag=x -var google_client_id=y` —
  expands to
  `terraform -chdir=.../infra/prod plan -var image_tag=x -var google_client_id=y`.
  `*args` passthrough works on `just` 1.58; `-var` flags are **not** swallowed
  by `just`. Same for `infra/apply`.
- `terraform -chdir=infra/prod plan -var image_tag=e28e643b6768 -var google_client_id=<dummy>`
  — see result below. (ADC + GCS backend both worked first try, same as
  worklog 0012.)

### terraform plan result

`Plan: 3 to add, 0 to change, 0 to destroy.` — exactly the proposal's shape:

| Resource | Notable resolved values |
| --- | --- |
| `google_service_account.runtime` | `email = siorie-run@siorie.iam.gserviceaccount.com`, no role bindings |
| `google_cloud_run_v2_service.app` | `name = "siorie"`, `deletion_protection = false`, `ingress = INGRESS_TRAFFIC_ALL`, `template.service_account = siorie-run@…`, `scaling { min 0 / max 1 }`, `image = asia-northeast1-docker.pkg.dev/siorie/siorie/app:e28e643b6768`, `ports.container_port = 8080` |
| `google_cloud_run_v2_service_iam_member.public` | `role = roles/run.invoker`, `member = allUsers`, `name = "siorie"` |

`Changes to Outputs: + cloud_run_url = (known after apply)`. The AR repository
is untouched (`0 to change`).

**Built `APP_ORIGIN` resolved to `https://siorie-618741051931.asia-northeast1.run.app`**
(project number `618741051931`). At the time I wrote this I read that as "the
new `<name>-<project number>` scheme, likely to match the real `.uri`".
**That was wrong** — the operator's apply showed the real `.uri` is
`https://siorie-u6y3wdsaua-an.a.run.app` (legacy hash scheme). See Difficulties
→ "The constructed APP_ORIGIN is wrong".

Provider `hashicorp/google` 6.50.0 accepts `deletion_protection` on
`google_cloud_run_v2_service` (shows as `+ deletion_protection = false` in the
plan, no warning). The plan also lists a read-only `urls` (plural) attribute
alongside `uri`; the output uses `.uri` per the proposal.

### Blocked / left to the operator

- `terraform -chdir=infra/prod apply` — the auto-mode classifier blocks
  `terraform apply` for `infra/prod/` (worklog 0012). The operator runs apply
  and the connectivity check:

  ```
  # from the repo, deploying the image already in Artifact Registry:
  just infra/apply prod \
    -var image_tag=e28e643b6768 \
    -var google_client_id=<oauth-web-client-id>

  terraform -chdir=infra/prod plan -var image_tag=e28e643b6768 -var google_client_id=<id>   # expect: No changes
  curl -i "$(terraform -chdir=infra/prod output -raw cloud_run_url)/api/hello"              # expect: 200 JSON
  # open the same URL in a browser — any response ( / may 404 )
  ```

  To deploy current HEAD instead, run `just infra/publish-image` first and use
  `image_tag=$(git rev-parse --short=12 HEAD)`.

### Operator-confirmed — connectivity check

The operator ran `just infra/apply prod -var image_tag=e28e643b6768 -var
google_client_id=618741051931-…apps.googleusercontent.com` (the real OAuth Web
client ID, kept out of the repo). All of the proposal's completion conditions
are met:

- **apply succeeded** — `google_cloud_run_v2_service.app`,
  `google_service_account.runtime`, and
  `google_cloud_run_v2_service_iam_member.public` all created. The `allUsers`
  invoker binding was accepted (no org policy blocked it, as the preflight
  predicted).
- **`terraform output cloud_run_url`** → `https://siorie-u6y3wdsaua-an.a.run.app`.
- **`curl -i https://siorie-u6y3wdsaua-an.a.run.app/api/hello`** → `HTTP/2 200`,
  `content-type: application/json`,
  body `{"$schema":"https://siorie-u6y3wdsaua-an.a.run.app/schemas/HelloOutputBody.json","message":"Hello, World!"}`.
  Served by `Google Frontend`, HTTP/2 + HTTP/3 advertised. The container came up
  on `PORT` (injected), the three required env vars were present, and the Go
  server did not `log.Fatalf`.
- **re-plan idempotency** — a re-`plan` with the *same* two `-var` values the
  operator applied with is "No changes". (Re-running `plan` here with a *dummy*
  `google_client_id` shows `1 to change` — only the `GOOGLE_CLIENT_ID` env
  flipping to the dummy string. That is an artifact of passing a different
  `-var`, not drift: the value is not stored in the repo, so anyone re-planning
  must pass the same client ID that was applied.)
- **built `APP_ORIGIN` vs. real `.uri`** — **they do not match.** Built:
  `https://siorie-618741051931.asia-northeast1.run.app`. Real:
  `https://siorie-u6y3wdsaua-an.a.run.app`. See Difficulties — this is the
  proposal's flagged URL-format risk actually landing.

## What was done

Agent side (code + local verification) — complete:

- `infra/prod/main.tf` — added `data.google_project.this`,
  `google_service_account.runtime` (dormant, `siorie-run`, no role bindings),
  `google_cloud_run_v2_service.app` (`name = "siorie"`,
  `deletion_protection = false`, `ingress = INGRESS_TRAFFIC_ALL`, runtime SA,
  `scaling` min 0 / max 1, image from `<ar-path>/app:${var.image_tag}` on port
  8080, env `GOOGLE_CLIENT_ID` / `APP_ORIGIN` (built from the project number) /
  `FIRESTORE_PROJECT_ID`), and `google_cloud_run_v2_service_iam_member.public`
  (`roles/run.invoker` → `allUsers`). Trimmed the trailing "coming later"
  comment.
- `infra/prod/variables.tf` — `image_tag` and `google_client_id`, `string`, no
  default.
- `infra/prod/outputs.tf` — `cloud_run_url = google_cloud_run_v2_service.app.uri`.
- `infra/justfile` — `plan` / `apply` recipes take `*args` (pass straight to
  `terraform`); "Deploy container image" block gained a deploy-step comment.
- `docs/discussions/0024-cloud-run-service/discovery.md` — `status: proposed →
  worked`, `worklogs: [0013-cloud-run-service]` (bidirectional link).
- Verified locally: `terraform fmt` (clean), `validate` (Success), `just
  --dry-run` for the new passthrough, and `terraform plan` against the real GCS
  backend — `3 to add, 0 to change, 0 to destroy`, `cloud_run_url` output
  added, AR repository untouched. Built `APP_ORIGIN` resolves to
  `https://siorie-618741051931.asia-northeast1.run.app` — which the operator's
  apply then showed does **not** match the assigned URL (see Difficulties).

Operator side (`apply` + connectivity check) — **done.** The operator applied
`image_tag=e28e643b6768` with the real OAuth Web client ID; the three resources
were created, `curl https://siorie-u6y3wdsaua-an.a.run.app/api/hello` returned
`200` JSON, and a re-plan with the same vars is clean. The built `APP_ORIGIN`
does **not** match the assigned URL (see Difficulties). Details in
"Operator-confirmed — connectivity check" above.

## Difficulties

One of the proposal's flagged risks actually materialized (the `APP_ORIGIN` URL
format). Everything else went as the proposal anticipated.

### The constructed APP_ORIGIN is wrong — this project gets a legacy-format run.app URL

**This is the one finding that contradicts a proposal assumption.**

The proposal's "`APP_ORIGIN` を決定論的 URL で構築することについて" section rests
on: *"新しい `run.app` URL は `https://<service>-<project number>.<region>.run.app`
で決定論的に決まる"*, and lists the risk *"プロジェクトが旧 URL 形式（ランダム
ハッシュ）だと構築値が外れる"*. That risk is real for this project:

| | value |
| --- | --- |
| built `APP_ORIGIN` env | `https://siorie-618741051931.asia-northeast1.run.app` |
| real `google_cloud_run_v2_service.app.uri` | `https://siorie-u6y3wdsaua-an.a.run.app` |

The assigned URL is the older `<name>-<hash>-<region-code>.a.run.app` form, not
the `<name>-<project number>.<region>.run.app` form the construction assumes.
The project number (`618741051931`) is correct; the *scheme* is not what this
project issues. At plan time this was not visible — `data.google_project` only
yields the number, and I wrongly read "number resolves cleanly" as "the built
URL will match" in the plan-result note above. It took the operator's apply to
expose it.

Impact on this round: **none observed.** `curl /api/hello` returned `200` — that
route does not run the `Origin` check. But `APP_ORIGIN` is now definitively
wrong in production, and:

- The SPA-co-serving round *must* fix this (the proposal already said "SPA 同梱
  のラウンドで env を実値へ移す", but framed it as a refinement — it is now
  mandatory, and the "construct deterministically so one apply is enough"
  rationale does not hold here).
- Fixing it is not a one-liner. The proposal correctly notes a resource cannot
  self-reference `.uri` in its own `env`, so switching to the real value needs
  either a committed URL literal
  (`https://siorie-u6y3wdsaua-an.a.run.app` in `terraform.tfvars` / a `local`),
  or a two-resource split, or a data source that reads the service back after
  creation. That is a real design choice the next round inherits.
- Any manual `POST /api/*` test against the live URL before that fix will fail
  the `Origin` check. Worth a comment near the `APP_ORIGIN` env block; left for
  the next round so the fix and the note land together.

### `terraform apply` for infra/prod is (still) blocked by the auto-mode classifier

Same boundary as worklog 0012: `plan` runs fine directly, `apply` for
`infra/prod/` is refused by the Claude Code auto-mode classifier. The proposal
already assumed this and wrote the apply + connectivity check as operator steps,
so the only cost is the same agent/operator split of "apply + verify". Not a
design signal — a fixed tooling boundary. Worklog 0012 already dispositioned
this as "no discovery"; nothing new here.

### The Artifact Registry image is behind repo HEAD

The only image tag in Artifact Registry is `app:e28e643b6768` (pushed during
worklog 0012). Repo HEAD is `c06cc8f3b6e9` — three commits ahead, all docs-only,
so the pushed image is functionally current and the connectivity check can
deploy `e28e643b6768` as-is. This is the expected behaviour of decision 0012
("no `:latest`, tag = short commit SHA, push by hand"): no floating pointer,
nothing rebuilds on commit, so the deployed tag and repo HEAD drift as soon as a
commit lands without a manual `publish-image`. The proposal's preflight already
said to read the SHA out of Artifact Registry and pass *that* as `image_tag`, so
this is not a surprise — recorded only so the next reader does not expect
`image_tag == $(git rev-parse --short=12 HEAD)`.

### Resolved risks (no action needed)

- **`just` swallowing `-var`.** The proposal's risk #1 (two default-less
  variables → every `prod` plan/apply needs `-var image_tag=… -var
  google_client_id=…`) carried a latent worry that `just`'s own arg parser would
  eat the `-var` flags. On `just` 1.58 it does not: `plan layer *args` /
  `apply layer *args` forward `-var …` verbatim (`just --dry-run` confirms). The
  friction the proposal named is real (a bare `just infra/plan prod` now fails),
  but it is exactly the accepted tradeoff, not worse.
- **Firestore `(default)` import question.** The proposal's preflight asked
  whether a `(default)` database already exists (to decide `terraform import`
  vs. create next round). It does **not** — `gcloud firestore databases list` is
  empty. Next round creates it fresh; no import.
- **`allUsers` invoker org policy.** No organization on the account and no
  `iam.allowedPolicyMemberDomains` rule, so the `roles/run.invoker` → `allUsers`
  binding applied cleanly (confirmed by the operator's apply).
- **`deletion_protection` on `google_cloud_run_v2_service`.** Provider
  `hashicorp/google` 6.50.0 supports it; `plan` shows `+ deletion_protection =
  false` with no deprecation/unknown-field warning.

## Review

Two things are worth a second look. Neither is a one-off accident; both are the
operator's call on whether a `discovery.md` should follow.

### 1. `APP_ORIGIN` construction — structural, not incidental

The proposal chose "build `APP_ORIGIN` from the project number" specifically to
avoid a two-phase apply, on the stated assumption that the URL scheme is
`<name>-<project number>.<region>.run.app`. This project issues the older
`<name>-<hash>-<region-code>.a.run.app` instead, so the built value is wrong and
the chosen approach cannot be salvaged by "apply once more" — a resource cannot
reference its own `.uri`. The next round (SPA co-serving) has to pick a real
mechanism: a committed URL literal, a two-resource split, or a read-back data
source. This is a genuine gap between the proposal's model of Cloud Run URLs and
this project's behaviour, and it changes what the next round must do.

### 2. Two mandatory `-var` flags on every `infra/prod/` operation

The proposal's risk #1. Not a bug — `just` forwards `-var` fine — and chosen
deliberately over committing `image_tag` / `google_client_id`. But it is a
standing sharp edge: a bare `just infra/plan prod` for an unrelated change now
errors, and the `TF_VAR_*`-in-the-shell mitigation trades that error for a
silent stale default.

### Follow-up discoveries (written at the operator's request)

Both were raised as `discovery.md` on 2026-08-30:

- [0025-cloud-run-app-origin](../../discussions/0025-cloud-run-app-origin/discovery.md)
  — from difficulty "The constructed APP_ORIGIN is wrong". How the Go service
  learns its own public origin.
- [0026-infra-per-deploy-inputs](../../discussions/0026-infra-per-deploy-inputs/discovery.md)
  — from Review #2. Where non-secret, per-deploy infra inputs (`image_tag`,
  `google_client_id`) live.
