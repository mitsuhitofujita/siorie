---
date: 2026-09-05
status: in-progress
discussions: [0029-github-actions-manual-deploy]
decisions: []
pr: null
---

# Manual deploy from GitHub Actions (`workflow_dispatch` + Workload Identity Federation)

Implements [discussion 0029](../../discussions/0029-github-actions-manual-deploy/proposal.md):
add `.github/workflows/deploy.yml`, dispatched by hand from `main` only, that
runs `just check` as a gate, builds and pushes the deploy image with the
existing `just infra/publish-image`, and applies `infra/app` — authenticating
through GitHub's OIDC token exchanged at a Workload Identity Federation pool
for the dormant `deployer` service account (no key). The WIF pool / provider
and the state-bucket binding land in `infra/bootstrap`; the roles the deployer
needs for `app` land in `infra/platform`. Push-triggered deploys and ordinary
push / PR CI are out of scope (separate discoveries).

This worklog is also the vehicle that settles the CI/CD service selection
parked in [discussion 0003](../../discussions/0003-cicd-service-selection/proposal.md)
(GitHub Actions + WIF); the `/decide` step is expected to flip 0003 to
`decided`.

## Preflight (checked before starting, 2026-09-05)

| Check | State |
| --- | --- |
| `gcloud` account / project | `mitsuhitofujita@gmail.com` / `siorie` (project number `618741051931`) |
| `gh` auth | logged in as `mitsuhitofujita`, scopes `repo`, `workflow`, `read:org`, `gist` |
| repo visibility / Actions | `PUBLIC`; Actions enabled, `allowed_actions: all`, default workflow token permissions `read`; `main` not branch-protected; **no** Environments yet |
| `.github/` | absent |
| `infra/prod/` retirement | **partly done by the operator already**: `gs://siorie-tfstate/` holds only `app/default.tfstate` and `platform/default.tfstate` — the `prod/` prefix is gone entirely (not just emptied), so `state rm` + object removal happened. Still pending: the local `infra/prod/` directory, the four `import` blocks in `infra/platform/main.tf` / `infra/app/main.tf`, the `/infra/prod/*.tfstate*` lines in `.gitignore`. |
| `platform` state | serial 2: AR repo, Firestore `(default)`, runtime SA, `roles/datastore.user` — imports landed |
| `app` state | serial 5: Cloud Run service + invoker (+ the two data sources) — imports landed |
| `bootstrap` state | serial 20, local + committed: 13 `google_project_service`, bucket, `deployer` SA. `sts` / `iamcredentials` enabled. |
| WIF pools in project | none |
| `deployer` SA IAM | no bindings on the SA, none on the project, none on the bucket (bucket has only the legacy project-role bindings) |
| live Cloud Run service | `https://siorie-u6y3wdsaua-an.a.run.app`, image `app:29025c3a738b` (= current `main` minus the two docs commits), env `GOOGLE_CLIENT_ID` (72 chars, `618741…apps.googleusercontent.com`), `APP_ORIGIN` = the URL above, `WEB_ROOT=/web` |
| Artifact Registry tags | `29025c3a738b`, `e28e643b6768` |
| current `main` HEAD | `0f3db12ca039` (docs only on top of `29025c3a738b`) |
| latest action releases | `actions/checkout` v7.0.1, `jdx/mise-action` v4.3.0, `google-github-actions/auth` v3 |
| `jdx/mise-action` v4 PATH export | adds each tool's bin dir to `GITHUB_PATH` individually (`export_path: true` default) — so `docker-credential-gcloud` from the gcloud SDK bin dir is on PATH without shims |
| `google-github-actions/auth` v3 | writes `gha-creds-*.json` into `$GITHUB_WORKSPACE` (post-step deletes it); exports `GOOGLE_APPLICATION_CREDENTIALS` + `CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE`; README asks for `gha-creds-*.json` in `.dockerignore` |
| mise `gcloud` backend | `vfox:mise-plugins/vfox-gcloud`, resolves `latest` → 583.0.0 locally |

## Plan

0. **Finish the `infra/prod/` retirement** (proposal precondition). Delete
   `infra/prod/`; drop the two `import` blocks each from
   `infra/platform/main.tf` and `infra/app/main.tf`; drop the `prod` lines from
   `.gitignore`. Re-plan `platform` (no `-var`) and `app`
   (`image_tag=29025c3a738b`, live client ID, live URL) → both "No changes".
   Commit.
1. **`infra/bootstrap/`**: `google_iam_workload_identity_pool.github`,
   `google_iam_workload_identity_pool_provider.github_actions` (OIDC, GitHub
   issuer, mapping `google.subject` / `attribute.repository` / `attribute.ref`,
   condition `repository == "mitsuhitofujita/siorie" && ref == "refs/heads/main"`),
   `google_service_account_iam_member` (`roles/iam.workloadIdentityUser` on
   `deployer` for `principalSet://…/attribute.repository/mitsuhitofujita/siorie`),
   `google_storage_bucket_iam_member` (`roles/storage.objectUser` on
   `siorie-tfstate`, condition `resource.name.startsWith(".../objects/app/")`),
   a `github_repository` variable (value in the committed `terraform.tfvars`),
   and a `workload_identity_provider` output. Deviation from the proposal: no
   `data.google_project` — the pool's `.name` attribute already carries the
   project number, so the principalSet is built from it directly.
   `fmt` / `validate` / `plan` / `apply` locally; commit the updated
   `terraform.tfstate`.
2. **`infra/platform/`**: `data.google_service_account.deployer`;
   `google_artifact_registry_repository_iam_member` (`roles/artifactregistry.writer`
   on repo `siorie`), `google_service_account_iam_member`
   (`roles/iam.serviceAccountUser` on `siorie-run`),
   `google_project_iam_member` (`roles/run.admin`). `plan` / `apply`.
3. **Resolve open risk 1 (GCS backend vs. the prefix-conditioned binding)**
   before the first dispatch, with a one-off read-only impersonation check from
   the workstation (`gcloud storage ls/cat … --impersonate-service-account=deployer@…`):
   list under `app/`, read `app/default.tfstate`, and confirm
   `platform/default.tfstate` is denied. If list is denied, add the smallest
   unconditional list-only role and re-check.
4. **GitHub**: Environment `production` with a custom deployment-branch policy
   allowing only `main`; Environment secrets `GOOGLE_CLIENT_ID` and
   `APP_ORIGIN` taken from the live service (via `gh secret set --env`).
5. **`.github/workflows/deploy.yml`** as in the proposal's overview
   (`workflow_dispatch`, `permissions: id-token: write / contents: read`,
   `concurrency: deploy`, `environment: production`, checkout → mise-action →
   `just setup` → `just check` → auth → `just infra/docker-auth` →
   `just infra/publish-image` → `just infra/init app` → `just infra/apply app
   -auto-approve -input=false -var …`). Secrets go into step `env:` and are
   referenced as shell variables, not interpolated into the script. Add
   `gha-creds-*.json` to `.dockerignore`.
6. Commit, push to `main`, dispatch (`gh workflow run deploy.yml --ref main`),
   watch the run, verify: new Cloud Run revision on the dispatched SHA, sign-in
   from a browser (operator). Re-plan `bootstrap` / `platform` → no diff.
   Negative check: dispatch the same workflow from a non-`main` branch and see
   the auth step fail (if practical).
7. Docs: `docs/design/repository-structure.md` (CI/CD present, `prod` gone,
   bootstrap / platform contents, `.github/`), `README.md` (deploy section).

## Progress

### Step 0 — `infra/prod/` retirement (done, committed)

- `gs://siorie-tfstate/prod/` was already gone (preflight), so no `state rm`
  was needed. Deleted `infra/prod/` (tracked files + the local `.terraform/`),
  the two `import` blocks each in `infra/platform/main.tf` and
  `infra/app/main.tf`, and the `/infra/prod/*.tfstate*` lines in `.gitignore`.
- Re-plan: `platform` → "No changes". `app` (with `image_tag=29025c3a738b`,
  the live client ID, the live URL) → `0 add / 1 change / 0 destroy`: the
  change is the provider-side top-level `scaling {}` block
  (`manual_instance_count = 0 -> null`, `min_instance_count = 0 -> null`)
  that worklog 0015 already saw on import. See Difficulties — it did not go
  away with the operator's applies, so it is a perpetual no-op diff, not a
  leftover of this step.
- Stale "prod layer" comments in `infra/bootstrap/main.tf` / `outputs.tf`
  refreshed while editing that layer in step 1.

### Steps 1–2 — bootstrap and platform Terraform (written, planned, applied after the operator's go-ahead)

- `infra/bootstrap/`: `google_iam_workload_identity_pool.github`,
  `google_iam_workload_identity_pool_provider.github_actions` (OIDC issuer
  `https://token.actions.githubusercontent.com`; mapping `google.subject` =
  `assertion.sub`, `attribute.repository`, `attribute.ref`; condition
  `assertion.repository == "mitsuhitofujita/siorie" && assertion.ref == "refs/heads/main"`),
  `google_service_account_iam_member.deployer_workload_identity_user`
  (`roles/iam.workloadIdentityUser`, member
  `principalSet://iam.googleapis.com/${pool.name}/attribute.repository/mitsuhitofujita/siorie`),
  `google_storage_bucket_iam_member.deployer_app_state`
  (`roles/storage.objectUser` on `siorie-tfstate`, condition
  `resource.name.startsWith("projects/_/buckets/siorie-tfstate/objects/app/")`),
  `google_storage_bucket_iam_member.deployer_state_list`
  (unconditional `roles/storage.legacyBucketReader` — added after resolving
  the proposal's open risk 1 by reading, see Difficulties),
  `var.github_repository` (in the committed `terraform.tfvars`), outputs
  `workload_identity_provider` (+ reworded `deployer_service_account_email`
  and `state_bucket_name` descriptions), and the deployer SA's
  `display_name` reworded (no longer "dormant"). No `data.google_project`:
  the pool's `.name` already carries the project number.
- `infra/platform/`: `data.google_service_account.deployer`,
  `google_artifact_registry_repository_iam_member.deployer_writer`
  (`roles/artifactregistry.writer` on repo `siorie`),
  `google_service_account_iam_member.deployer_acts_as_runtime`
  (`roles/iam.serviceAccountUser` on `siorie-run`),
  `google_project_iam_member.deployer_run_admin` (`roles/run.admin`).
- `terraform fmt -check` clean; `validate` OK in both layers.
- `plan` bootstrap: `5 to add, 1 to change, 0 to destroy` — the change is the
  deployer `display_name`; output `workload_identity_provider` known after
  apply. `plan` platform: `3 to add, 0 to change, 0 to destroy`. No replace
  anywhere.
- **`terraform apply` for both layers was first denied by the auto-mode
  classifier**, exactly as in worklogs 0012 / 0013 / 0015 / 0016 (this time
  including `bootstrap`, which worklog 0011 had been allowed to apply). The
  Terraform config was committed ahead of the apply, as 0015 did, and the
  handoff was written up. The operator then said in chat that the agent may
  go through apply; a retry via the `just` recipes passed with no change to
  `.claude/settings.json`:
  - `just infra/apply bootstrap -input=false -auto-approve` →
    `5 added, 1 changed, 0 destroyed`. `workload_identity_provider` =
    `projects/618741051931/locations/global/workloadIdentityPools/github/providers/github-actions`,
    identical to the literal in the workflow. State serial 20 → 27,
    committed (`chore(infra): record the bootstrap apply for worklog 0017`).
  - `just infra/apply platform -input=false -auto-approve` →
    `3 added, 0 changed, 0 destroyed`.
  - `gcloud iam workload-identity-pools providers describe` shows the
    provider `ACTIVE` with the intended attribute condition.

### Step 3 — GCS backend vs. the prefix condition (resolved by reading; empirical check not possible locally)

Resolved from the Terraform source and IAM semantics instead of a live
check — see Difficulties. The bootstrap layer grants list unconditionally
(`legacyBucketReader`) next to the prefix-conditioned `objectUser`. Two
attempts at a local confirmation after the apply both failed for reasons
outside this worklog's scope:

- `gcloud storage ls/cat … --impersonate-service-account=deployer@…` →
  `iam.serviceAccounts.getAccessToken` denied: the basic Owner role does
  **not** carry token-creator on service accounts, and granting the operator
  `roles/iam.serviceAccountTokenCreator` on `deployer` would contradict
  0022's "no local impersonation".
- `gcloud policy-troubleshoot iam …` → the Policy Troubleshooter API is not
  enabled in the project; enabling an API is a project mutation outside the
  proposal.

So the first dispatch's `terraform init` is the test. If it fails with a 403
on `storage.objects.list`, the reasoning in Difficulties is wrong.

### Step 4 — GitHub Environment and secrets (done)

- Environment `production` created via the REST API with
  `deployment_branch_policy = { protected_branches: false, custom_branch_policies: true }`,
  then a branch policy `main` (type `branch`) added. No required reviewers
  (as proposed).
- Environment secrets `GOOGLE_CLIENT_ID` (read from the live Cloud Run
  service's env, never echoed) and `APP_ORIGIN`
  (`https://siorie-u6y3wdsaua-an.a.run.app`, the live service URL) set with
  `gh secret set --env production`. `gh secret list --env production` shows
  both.

### Step 5 — workflow (done, committed)

- `.github/workflows/deploy.yml` as planned. Additions beyond the proposal's
  sketch: `CLOUDSDK_CORE_DISABLE_PROMPTS=1` and `TF_IN_AUTOMATION=1` in the
  workflow `env:` (no TTY on the runner; `gcloud auth configure-docker`
  asks "Do you want to continue?" and the recipe has no `--quiet`); a
  separate "Resolve image tag" step whose output feeds the apply, so
  `image_tag` is computed once by the same expression `publish-image` uses;
  secrets passed via step `env:` and expanded by the shell rather than
  interpolated with `${{ }}` into the script. Actions pinned by major tag
  (`actions/checkout@v7`, `jdx/mise-action@v4`,
  `google-github-actions/auth@v3`), not by SHA — no Dependabot here to keep
  SHAs fresh; revisit if the repo adopts SHA pinning.
- `.dockerignore`: `gha-creds-*.json` (the auth action writes its credential
  file into the checkout, which is the Docker build context).
- `actionlint` (v1.7.12, via `go run`) reports no findings. `just check` is
  green locally on this tree, i.e. the gate the workflow runs passes here.

### Step 6 — push, dispatch, verify (operator; first dispatch failed on IAM propagation)

- The agent did not push (`.claude/settings.json` denies `git push *`). The
  operator pushed `main` up to `745c118` during the session and dispatched
  the workflow themselves at 15:39:25Z — 8 s after the bootstrap apply had
  written its last binding (15:39:17Z) and about two minutes **before** the
  platform apply set the deployer's roles (15:41:20–23Z).
- Run 33890726359 (`main` @ `745c1188aa32`), 3m17s, `failure` at the last
  step. Everything else passed, which retires most of the proposal's open
  risks:

  | Step | Duration | Outcome |
  | --- | --- | --- |
  | `actions/checkout@v7` | 1 s | ok |
  | `jdx/mise-action@v4` | 19 s | ok — all `mise.toml` tools installed (go 1.27.1, gcloud 583.0.0, temurin-25, node, pnpm, just, terraform 1.15.9) |
  | `just setup` | 32 s | ok — `gcloud components install cloud-firestore-emulator` downloaded 66.9 MiB; harmless "other instances of Google Cloud tools on your PATH" warning |
  | `just check` | 45 s | ok — Go tests against the emulator, web lint (0 errors, 1 pre-existing `react-hooks/exhaustive-deps` warning), vitest, `vite build`, `terraform fmt -check` |
  | `google-github-actions/auth@v3` | 1 s | ok — OIDC → WIF → `deployer`; credential file written into the checkout (proposal's WIF path works; the `ref == refs/heads/main` condition admitted a `workflow_dispatch` job bound to an Environment) |
  | `just infra/docker-auth` | 1 s | ok — "Docker configuration file updated", no prompt (`CLOUDSDK_CORE_DISABLE_PROMPTS`) |
  | `just infra/publish-image` | 74 s | ok — built all three stages and pushed `app:745c1188aa32` through `docker-credential-gcloud` with the federated credential file (proposal risk 5 closed; no `docker login` fallback needed) |
  | `just infra/init app` | 5 s | ok — "Successfully configured the backend gcs": `storage.objects.list` via `legacyBucketReader` + get under `app/` via the conditional `objectUser` are sufficient (proposal risk 1 closed as decided in Difficulties) |
  | `just infra/apply app` | 6 s | **failed** — `data.google_artifact_registry_repository.app`: 403 `artifactregistry.repositories.get` denied on `projects/siorie/locations/asia-northeast1/repositories/siorie` |

- Second dispatch (operator, after pushing the remaining docs commits):
  run 33891738701 on `main` @ `cc2089b125c3`, **success**, 3m49s
  (15:50:03Z → 15:53:52Z). mise-action 11 s (cache hit), setup 34 s, check
  67 s, auth 0 s, docker-auth 1 s, build + push 79 s, init 3 s, apply 21 s.
  The apply's plan was `0 to add, 1 to change, 0 to destroy` — the image tag
  plus the perpetual `scaling {}` no-op — and `cloud_run_url` printed as
  `***` because its value equals the `APP_ORIGIN` secret (expected; the
  masking works on outputs too).
- Verified afterwards from the workstation: Cloud Run's latest ready revision
  is `siorie-00004-mv5` (created 15:53:36Z, Ready) on
  `asia-northeast1-docker.pkg.dev/siorie/siorie/app:cc2089b125c3`, the tag
  being exactly `git rev-parse --short=12 origin/main`. Serving checks
  against `https://siorie-u6y3wdsaua-an.a.run.app`: `/` and `/groups/abc` →
  200 `text/html` `no-cache`; `/api/hello` → 200 JSON; `/api/nope` and
  `/assets/missing.js` → 404. `just infra/plan bootstrap` / `platform` →
  "No changes" (checked once after the applies). `infra/app` re-planned with
  the deployed values still shows the `scaling {}` diff (see Difficulties),
  so that one is confirmed perpetual, not cleared by the CI apply either.
- The 403 in the first run is not a missing role. `roles/artifactregistry.writer` carries
  `artifactregistry.repositories.get` (checked with `gcloud iam roles
  describe`), and the same binding had just authorised the image push. The
  binding was created at 15:41:20Z; the push succeeded at 15:42:17–27Z; the
  `get` was refused at 15:42:38Z, 78 s after the binding — IAM propagation
  lag between Artifact Registry's data plane (upload) and its control plane
  (`GetRepository`). `data.google_service_account.runtime` (its binding set
  at 15:41:21Z) read fine two seconds earlier. Nothing to change; a
  re-dispatch after propagation is the fix. Note that Artifact Registry
  data-access audit logs are off by default, so neither the push nor the
  denied `get` appears in Cloud Logging — the timeline above comes from the
  Admin Activity `SetIamPolicy` entries plus the run log.

### Step 7 — docs (done)

- `docs/design/repository-structure.md`: tree (`.github/workflows/deploy.yml`
  added, `infra/prod/` removed, bootstrap / platform annotations), `infra/`
  intro (who applies which layer), bootstrap bullet (WIF pool / provider /
  bindings, outputs), platform bullet (deployer roles), `infra/prod/` bullet
  removed, credentials paragraph, `.gitignore` / `.dockerignore` bullets, a
  new `.github/workflows/deploy.yml` bullet under Root, "Not yet present"
  rewritten (no push-triggered deploy, no push / PR CI, `APP_ORIGIN` secret
  can go stale, `mise` `latest` pins on the gate).
- `README.md`: a "Deployment" section — how to dispatch (`gh workflow run
  deploy.yml --ref main`), the one-time setup, and the workstation path for
  rollback.
- Discovery 0029 frontmatter: `status: proposed → worked`,
  `worklogs: [0017-github-actions-manual-deploy]`.

## Commits

- `chore(infra): retire infra/prod and drop the 0027 import blocks`
- `feat(infra): deploy infra/app from GitHub Actions via Workload Identity Federation`
- `docs: record the GitHub Actions manual deploy worklog (worklog 0017)`
- `chore(infra): record the bootstrap apply for worklog 0017`
- `docs: record the applies and open discovery 0030 (worklog 0017)`
- `docs: record the first dispatch of worklog 0017` — the failed run
- `docs: record the successful deploy of worklog 0017` — the second run and
  the checks above

## Difficulties

- **`terraform apply` is blocked by the auto-mode classifier for every
  layer — this time including `bootstrap`**, which worklog 0011 had been
  allowed to apply. This is the fifth infra worklog in a row (0012, 0013,
  0015, 0016, now 0017) that ends as a two-phase handoff: the agent writes
  and plans, the operator applies and verifies. For this worklog the cost is
  higher than before, because *all* of the proposal's completion criteria —
  the dispatch, the new revision, the browser sign-in, the state-permission
  check, the negative test — sit behind the apply, and the difficulties they
  would surface (the Docker credential helper under WIF, mise on the runner,
  the gate's duration, whether `init` really needs list) will be met by the
  operator, outside the session that writes this worklog. Also worth noting
  for the boundary itself: creating the GitHub Environment, its branch
  policy, and two Environment secrets on the public repository via `gh api` /
  `gh secret set` was allowed, while a Terraform apply of IAM bindings was
  not — the line is drawn by tool name, not by blast radius. This looks
  structural, not accidental: either the split is the intended way of
  working (then proposals and `/work` should be written for it, with an
  explicit operator checklist and a rollout append as a standard section),
  or a permission rule for `just infra/apply <layer>` should exist.
  Outcome in this session: the operator authorised apply in chat, the retry
  passed, and asked for the discovery to be written —
  [0030-infra-apply-handoff](../../discussions/0030-infra-apply-handoff/discovery.md).

- **Open risk 1 (GCS backend vs. the prefix-conditioned binding) was decided
  by reading, not by running, and the answer is "the condition alone is not
  enough".** (A local confirmation turned out to be impossible without
  out-of-scope changes — see Step 3.) In Terraform's GCS backend, `Workspaces()` lists the bucket
  (`storage.Query{Prefix: b.prefix, Delimiter: "/"}`, i.e. prefix `app`) and
  is called from `selectWorkspace`, which `meta_backend.go` invokes only
  under `opts.Init`. So `terraform init` needs `storage.objects.list`;
  `plan` / `apply` only need get / create / update on `app/default.tfstate`
  and the lock file. `storage.objects.list` is a bucket-level permission
  evaluated against `projects/_/buckets/siorie-tfstate`, which an
  `objects/app/` name condition can never match. The prefix-scoped
  alternative — the `storage.googleapis.com/objectListPrefix` API attribute
  in a condition — is supported only in Credential Access Boundaries;
  Google's IAM docs state that using Cloud Storage API attributes in a
  conditional role binding makes Cloud Storage "work incorrectly and fail
  unexpectedly". Hence the proposal's fallback was applied pre-emptively:
  an unconditional `roles/storage.legacyBucketReader` (`storage.buckets.get`,
  `storage.objects.list`, folder / managed-folder get+list,
  `multipartUploads.list`; **no** `storage.objects.get`). Consequence for the
  proposal's "platform state stays sealed" claim: it holds for *contents*,
  not for *names* — `deployer` can list `platform/default.tfstate` but not
  read it. The empirical confirmation (impersonated `ls` / `cat`) is an
  operator step; if `ls` under `app/` is still denied, the reasoning above is
  wrong and the worklog should say so.

- **`infra/app` carries a perpetual no-op diff.** Every plan reports
  `1 to change` on `google_cloud_run_v2_service.app`: a top-level `scaling {}`
  block (`manual_instance_count = 0 -> null`, `min_instance_count = 0 ->
  null`) is read back from the API while the config declares none. Worklog
  0015 saw this on import and expected it to disappear on apply; it did not
  (state serial 5 after the 0016 apply still shows it). For this worklog it
  means the proposal's "dispatching the same commit twice ends with no
  Terraform diff" is not literally true — each run makes an update call.
  Service-level `scaling` is not part of the revision template, so it should
  not roll a new revision, but that is unverified. Not fixed here (`infra/app`
  is out of the proposal's scope); a small follow-up should either declare
  the block explicitly or bump the provider and re-check.

- **The starting point differed from the proposal's precondition.** The
  proposal assumed `terraform state rm` for `infra/prod` was still pending;
  in fact the whole `prod/` prefix had already been removed from the bucket
  by the operator after worklog 0015, and only the repo-side cleanup was
  left. Harmless, but it shows the proposal was written from 0015's
  "left to the operator" list rather than from the live bucket — 0015 never
  got a rollout append the way 0016 did, so the docs did not know the step
  was done. Same root as the first item: rollout facts live only with the
  operator unless a worklog append is a standard step.

- **The first dispatch raced the platform apply.** With apply and dispatch
  split between agent and operator, the operator dispatched 8 s after the
  bootstrap apply finished and before the platform apply had run; the run
  then outpaced IAM propagation of the roles created mid-run and failed on
  `artifactregistry.repositories.get` 78 s after the binding existed. Not a
  code problem, but a direct consequence of the handoff (see discovery
  0030): nothing in the process says "both applies, then wait for
  propagation, then dispatch". The `git push *` deny in
  `.claude/settings.json` keeps push and dispatch on the operator's side by
  design.

- **Deviations from the proposal, all small.** No `data.google_project` in
  bootstrap — the pool's `.name` already contains the project number.
  `CLOUDSDK_CORE_DISABLE_PROMPTS=1` and `TF_IN_AUTOMATION=1` in the workflow
  `env:` — `just infra/docker-auth` runs `gcloud auth configure-docker`
  without `--quiet`, which asks for confirmation, and the proposal keeps the
  justfile unchanged, so non-interactivity is imposed from outside. A
  dedicated "Resolve image tag" step feeds `image_tag` to the apply. The
  auth action's README asks for `gha-creds-*.json` in `.dockerignore` (its
  credential file lands inside the checkout, which is the build context).
  Actions are pinned by major tag (`@v7` / `@v4` / `@v3`), not by commit
  SHA — there is no Dependabot to keep SHAs fresh; the repo's
  `sha_pinning_required` setting is off. `just infra/init` runs
  `terraform init` without `-input=false`; acceptable without a TTY.

- **The negative test does not test what the proposal thinks it tests.**
  With the Environment's deployment-branch policy, a dispatch from a
  non-`main` branch is refused by GitHub before the job starts, so it
  exercises the GitHub-side gate, not the WIF attribute condition. Proving
  the condition would need a job without `environment: production` (a
  throwaway workflow variant). Recorded, not done.

- **Runner assumptions that could only be checked by running** (for the
  operator's first dispatch): the mise `vfox` gcloud plugin on
  `ubuntu-latest` and the SDK download size, `gcloud components install
  cloud-firestore-emulator` from `just setup`, Java via mise for the
  emulator, `lsof` for the test recipe's cleanup trap,
  `docker-credential-gcloud` honouring `CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE`
  (the proposal's risk 5; fallback is `docker login -u oauth2accesstoken` as
  documented in `infra/justfile`), Docker Hub pull limits for the `golang:` /
  `node:` base images, and the total run time (the gate builds both apps
  outside Docker, then the image builds them again).

## Left to the operator

The deploy path is live: `main` → `gh workflow run deploy.yml --ref main`
→ new Cloud Run revision on the commit's SHA. What the agent cannot do:

- A real Google sign-in from a browser at
  `https://siorie-u6y3wdsaua-an.a.run.app`, then create a group — the
  proposal's last completion criterion (exercises `GOOGLE_CLIENT_ID` from
  the secret at both build and apply time, and the `Origin` check against
  `APP_ORIGIN`). The image was built from the same client ID that was
  already live, so a regression is unlikely, but it is unverified.
- Optional: the non-`main` dispatch (`gh workflow run deploy.yml --ref
  <branch>`), expected to be refused by the Environment's branch policy.
- `/decide` — also flip discussion 0003 to `decided` and link it, as the
  proposal says. Discussion 0026 stays `open` (the workstation path still
  needs its three `-var`s).
