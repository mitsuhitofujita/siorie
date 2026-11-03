# Infrastructure & deployment

Production is a single Cloud Run service in Google Cloud project `siorie`,
region `asia-northeast1`, described by Terraform under `infra/`. `infra/` also
holds the deploy `Dockerfile` and the recipes to build and push the image.

## Terraform layers

Three root modules, split by how often each changes. There is no `modules/` or
`environments/` directory.

### `infra/bootstrap/`

The layer that must exist first. **Local state, committed to the repo**
(`terraform.tfstate`) — it creates the state bucket, so it cannot back itself
with it. Applied from a workstation with the operator's own credentials.

- `google_project_service.enabled` — enables the project APIs the whole system
  needs (Service Usage, Cloud Resource Manager, IAM, IAM Credentials, STS,
  Storage, Cloud Run, Artifact Registry, Firestore, Cloud Billing, Billing
  Budgets, Monitoring, Logging), `disable_on_destroy = false`.
- `google_storage_bucket.tfstate` — `siorie-tfstate`, `asia-northeast1`, uniform
  bucket-level access, public access prevention enforced, versioned, a 30-day
  noncurrent-version delete rule, `force_destroy = false`, `prevent_destroy`.
- `google_service_account.deployer` — the GitHub Actions deploy identity. No key
  is ever issued.
- Workload Identity Federation for GitHub Actions:
  `google_iam_workload_identity_pool.github` and its OIDC provider
  `github-actions` (issuer `token.actions.githubusercontent.com`; attribute
  mapping `google.subject` / `attribute.repository` / `attribute.ref`; attribute
  condition `assertion.repository == var.github_repository && assertion.ref ==
  "refs/heads/main"`, so forks and non-`main` refs are rejected at the STS
  exchange).
- `google_service_account_iam_member.deployer_workload_identity_user` —
  `roles/iam.workloadIdentityUser` on `deployer` for the pool's
  `attribute.repository/<repo>` principal set.
- State-bucket access for `deployer`:
  `roles/storage.objectUser` conditioned on
  `resource.name.startsWith(".../objects/app/")` (read/write the `app/` state
  prefix only), plus an unconditional `roles/storage.legacyBucketReader`
  (`terraform init` lists the bucket to enumerate workspaces, and
  `storage.objects.list` is a bucket-level permission an object-name condition
  cannot grant). `deployer` can see every object *name* but reads only under
  `app/`.
- Outputs: `state_bucket_name`, `deployer_service_account_email`,
  `workload_identity_provider`, `enabled_services`.
- Variables: `project_id`, `region` (default `asia-northeast1`),
  `github_repository` — all in the committed `terraform.tfvars`
  (`mitsuhitofujita/siorie`).

### `infra/platform/`

`backend "gcs"`, `prefix = "platform"`. Changes rarely. Applied from a
workstation (human-only).

- `google_artifact_registry_repository.app` — `siorie`, `DOCKER`,
  `asia-northeast1`. KEEP-only cleanup policy (`most_recent_versions`,
  `keep_count = 2`, `cleanup_policy_dry_run = true` — records retention intent,
  deletes nothing). Images: `asia-northeast1-docker.pkg.dev/siorie/siorie/app`.
- `google_service_account.runtime` — `siorie-run`, the Cloud Run runtime
  identity.
- `google_firestore_database.default` — `(default)`, `FIRESTORE_NATIVE`,
  `asia-northeast1`, App Engine integration disabled, point-in-time recovery at
  its default (off). Guarded by GCP-side
  `delete_protection_state = "DELETE_PROTECTION_ENABLED"` **and** Terraform
  `lifecycle { prevent_destroy = true }`. No security-rules or composite-index
  resources — all access is through the Go backend's Application Default
  Credentials.
- `google_project_iam_member.runtime_datastore` — `roles/datastore.user` on the
  runtime SA.
- `deployer` roles (SA read back via `data.google_service_account`):
  `roles/artifactregistry.writer` on the repository,
  `roles/iam.serviceAccountUser` on `siorie-run`, and project-level
  `roles/run.admin` (project-level and `run.admin` rather than a per-service
  `run.developer` grant, because `app` also manages the `allUsers` invoker
  binding and a per-service grant from `app` would have `deployer` grant
  itself).
- Output: `artifact_registry_repository` (the Docker path prefix). Variables:
  `project_id`, `region` — no default-less variables, so a bare
  `just infra/plan platform` works.

### `infra/app/`

`backend "gcs"`, `prefix = "app"`. The only layer that changes on every deploy.
Applied by the GitHub Actions workflow as `deployer`, or from a workstation for
rollbacks.

- Reads `platform` back through GCP `data` sources
  (`google_artifact_registry_repository`, `google_service_account`) — **not**
  `terraform_remote_state` — so a plan needs only ordinary project read access.
  There is no cross-module `depends_on`; when both layers change, apply
  `platform` first.
- `google_cloud_run_v2_service.app` — `siorie`, `INGRESS_TRAFFIC_ALL`,
  `deletion_protection = false`. Template: runs as the runtime SA,
  `scaling { min 0 / max 1 }`, one container from
  `<ar-path>/app:${var.image_tag}` on `container_port = 8080`, env
  `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `FIRESTORE_PROJECT_ID`, and `WEB_ROOT=/web`
  (a fixed literal — the image bakes the SPA there).
- `google_cloud_run_v2_service_iam_member.public` — `roles/run.invoker` for
  `allUsers`. The service is internet-reachable and the Go API is the
  authorization boundary. The project has no organization or domain-restriction
  org policy, so `allUsers` is accepted.
- Output: `cloud_run_url` (the assigned URL, a legacy-hash `*.a.run.app` form).
- Variables: `project_id`, `region`, and three **default-less** `-var`s that
  must be passed on every plan/apply — `image_tag`, `google_client_id`,
  `app_origin` (the last is the service's real URL, since a resource cannot
  reference its own `.uri`; the operator passes `terraform output
  cloud_run_url`).

All layers pin `terraform ~> 1.15` and `hashicorp/google ~> 6.50` with committed
lock files; `terraform.tfvars` is committed for each layer.

## Deploy image (`infra/Dockerfile`)

Multi-stage. Build context is always the repo root; `-f infra/Dockerfile` is
mandatory. A `.dockerignore` at the repo root scopes the context.

1. **builder** — `golang:1.27-bookworm`. Resolves modules from
   `apps/api/go.{mod,sum}` first (layer cache), then
   `CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server`.
2. **web** — `node:24-bookworm`. `corepack enable && pnpm install
   --frozen-lockfile` from `apps/web/package.json` + `pnpm-lock.yaml` first,
   then `ARG VITE_GOOGLE_CLIENT_ID` → `ENV` (inlined into the bundle by
   `vite build`), then `pnpm build`. `import.meta.env.DEV` is false here, so the
   Dev Login button is stripped.
3. **final** — `gcr.io/distroless/static-debian12:nonroot`. `COPY` the Go binary
   and `COPY --from=web /web/dist /web`. `ENTRYPOINT ["/server"]`, `EXPOSE 8080`
   (documentation only). Runs as UID 65532.

## Image build & push (`infra/justfile`)

- `docker-auth` — `gcloud auth configure-docker
  asia-northeast1-docker.pkg.dev`. Once per machine; not part of `setup`.
- `publish-image <google_client_id>` — builds from the repo root with
  `--build-arg VITE_GOOGLE_CLIENT_ID=<id>`, pushes, tags with
  `git rev-parse --short=12 HEAD`. No `:latest`, no dirty-tree guard. The client
  ID passed here must match the one passed to `just infra/apply app -var
  google_client_id=…`; a mismatch is a silent sign-in `401`.
- `init` / `plan` / `apply` / `output <layer>` — thin `terraform -chdir=` wrappers;
  trailing args pass straight through. `format` / `format-check` run
  `terraform fmt` over `infra/`.
- Build and push run on the operator's local container engine (podman works,
  with credential/short-name caveats noted in the justfile); Cloud Build is not
  used.

## Production deploy (`.github/workflows/deploy.yml`)

One workflow, `deploy`, triggered only by `workflow_dispatch`. There is no
push-triggered deploy and no push / PR CI.

- `permissions: contents: read, id-token: write`; `concurrency: deploy`
  (queued, never cancelled); one job on `ubuntu-latest` bound to the GitHub
  Environment `production` (deployment-branch policy: `main` only; secrets
  `GOOGLE_CLIENT_ID` and `APP_ORIGIN` — secrets, not variables, because the repo
  is public and run logs are world-readable).
- Steps: `actions/checkout` → `jdx/mise-action` (installs every `mise.toml`
  tool plus `just@latest`, and puts each bin dir on PATH, which is what makes
  `docker-credential-gcloud` resolvable) → `just setup` → `just check` (the
  gate, before any credential is minted) → `google-github-actions/auth`
  (GitHub OIDC → the WIF provider → impersonate `deployer`; writes a
  credential file honoured by gcloud, the Docker credential helper, and
  Terraform) → `just infra/docker-auth` → `just infra/publish-image
  "$GOOGLE_CLIENT_ID"` → `just infra/init app` → `just infra/apply app
  -input=false -auto-approve -var …`.
- `image_tag` is `git rev-parse --short=12 HEAD` of the checked-out commit — the
  same expression `publish-image` tags with, so the pushed and applied tags
  cannot diverge, and the one `GOOGLE_CLIENT_ID` secret feeds both the build arg
  and the Terraform variable. The WIF provider name and deployer email are
  non-secret literals in `env:`; secrets reach scripts only through step `env:`
  and shell expansion. `CLOUDSDK_CORE_DISABLE_PROMPTS` and `TF_IN_AUTOMATION`
  are set because the runner has no TTY.
- Re-dispatching the same commit is idempotent. Rollback is the workstation path
  with an older `image_tag`, or a revert commit dispatched from here.
- The one-time setup outside Terraform: create the `production` GitHub
  Environment with the `main`-only branch policy and the two Environment
  secrets, and register the production origin as an Authorized JavaScript origin
  on the OAuth Web client in the Google Cloud Console.
