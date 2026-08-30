---
date: 2026-08-30
status: merged
discussions: [0023-container-image-build-and-push]
decisions: [0012-container-image-build-and-registry]
pr: null
---

# Container image build-and-push path and Artifact Registry

Implements [discussion 0023](../../discussions/0023-container-image-build-and-push/proposal.md):
a first real resource in `infra/prod/` (an Artifact Registry Docker repository
with a KEEP-only cleanup policy), a minimal multi-stage `infra/Dockerfile` that
produces a Go-only image, a repo-root `.dockerignore`, and `infra/justfile`
recipes that build from the repo root and push to Artifact Registry, tagged with
the short commit SHA (no `:latest`). Cloud Run, runtime IAM, the Firestore
database, SPA co-serving, DELETE cleanup policies, and CI/CD automation are all
out of scope and deferred to later topics.

## Plan

1. `infra/prod/` — add `google_artifact_registry_repository.app`
   (`repository_id = "siorie"`, `DOCKER`, `location = var.region`,
   `cleanup_policy_dry_run = true`, one `KEEP` / `most_recent_versions`
   policy with `keep_count = 2`). Note in a comment that
   `artifactregistry.googleapis.com` is enabled by `infra/bootstrap/`.
2. `infra/Dockerfile` — multi-stage. builder `golang:1.27-bookworm`
   (matches `apps/api/go.mod` `go 1.27.0`), `go mod download` on
   `apps/api/go.{mod,sum}` first, then `CGO_ENABLED=0 GOOS=linux go build`.
   Final `gcr.io/distroless/static-debian12:nonroot`, `COPY --from=builder`,
   `ENTRYPOINT ["/server"]`, `EXPOSE 8080`.
3. `.dockerignore` at the repo root — build context is the repo root, so
   exclude `.git`, node/web/Go/Terraform build artifacts, `docs`, `.claude`,
   and env files.
4. `infra/justfile` — a `docker-auth` convenience recipe
   (`gcloud auth configure-docker asia-northeast1-docker.pkg.dev`) and a
   `publish-image` recipe (build with `-f infra/Dockerfile <repo-root>`, push,
   tag `git rev-parse --short=12 HEAD`, no dirty-tree guard). Reachable from
   the repo root as `just infra/publish-image` via just's path resolution
   (same as the existing `init`/`plan`/`apply`); no root `justfile` change
   needed for a standalone recipe.
5. `terraform -chdir=infra/prod` fmt / validate / plan / apply.
6. `just infra/docker-auth` then `just infra/publish-image`; confirm the image
   with `gcloud artifacts docker images list`.

## Preflight (from the proposal, checked before starting)

The proposal calls out a preflight checklist because worklog 0011's apply broke
on an unchecked premise (billing not linked → partial apply).

| Check | State on this machine |
| --- | --- |
| ADC for `terraform apply` (`infra/prod/`) | **present** — `~/.config/gcloud/application_default_credentials.json` exists, `quota_project_id = siorie`. (0011 had no ADC and used an OAuth token; this time ADC is configured.) |
| `gcloud` account | `mitsuhitofujita@gmail.com`, active |
| `gcloud config project` | `siorie` |
| billing linked | yes — done in worklog 0011 (`billingEnabled: true`) |
| `artifactregistry.googleapis.com` enabled | yes — enabled by `infra/bootstrap/` in worklog 0011 |
| `infra/prod/` backend | already `init`ed against `gs://siorie-tfstate` (prefix `prod`) |
| Docker engine | **podman 6.1.0 emulating docker** (`/usr/local/bin/docker` → podman), rootless, native (no VM). Not the `docker` the proposal assumes; see Difficulties. |
| `docker-credential-gcloud` on PATH | yes — ships with the gcloud SDK bin dir |
| `go` toolchain (for reference) | `go1.27.0` locally, so `golang:1.27-bookworm` is the right builder tag |

## Progress

### Files written

- `infra/prod/main.tf` — added `google_artifact_registry_repository.app`
  (`repository_id = "siorie"`, `format = "DOCKER"`, `location = var.region`
  → `asia-northeast1`). `cleanup_policy_dry_run = true` and one
  `cleanup_policies` block (`id = "keep-recent"`, `action = "KEEP"`,
  `most_recent_versions { keep_count = 2 }`). Comment records that
  `artifactregistry.googleapis.com` is enabled by `infra/bootstrap/`, that a
  KEEP policy on its own deletes nothing, and that the DELETE policy +
  `cleanup_policy_dry_run = false` are deferred. The old skeleton comment was
  replaced with a trimmed "coming later" list.
- `infra/prod/outputs.tf` — **new file, not in the proposal.** One output,
  `artifact_registry_repository`, computed as
  `"<location>-docker.pkg.dev/<project>/<repository_id>"`
  (= `asia-northeast1-docker.pkg.dev/siorie/siorie`). Mirrors
  `infra/bootstrap/outputs.tf` and hands the next (Cloud Run) worklog a value
  to consume. No managed-resource impact.
- `infra/Dockerfile` — multi-stage. builder `golang:1.27-bookworm`,
  `WORKDIR /src`, `COPY apps/api/go.{mod,sum}` → `go mod download` →
  `COPY apps/api/ ./` → `RUN CGO_ENABLED=0 GOOS=linux go build -o /server
  ./cmd/server`. Final `gcr.io/distroless/static-debian12:nonroot`,
  `COPY --from=builder /server /server`, `EXPOSE 8080`,
  `ENTRYPOINT ["/server"]`. Header comment states the `-f infra/Dockerfile
  <repo-root>` contract and that the image is Go-only for now.
- `.dockerignore` (repo root) — `.git`, `.claude`, `.local`, node/web/Go build
  artifacts, `**/.terraform` + `*.tfstate` + `*.tfstate.*` + `*.tfplan`,
  `docs`, `.env`, `apps/*/.env`. `.env.example` is intentionally not matched.
- `infra/justfile`:
  - vars `repo_root := parent_directory(source_directory())`,
    `ar_host := "asia-northeast1-docker.pkg.dev"`,
    `image := ar_host / "siorie/siorie/app"`.
  - `docker-auth` — `gcloud auth configure-docker {{ar_host}}`. Not in `setup`.
  - `publish-image` — bash recipe: `sha=$(git -C {{repo_root}} rev-parse
    --short=12 HEAD)`, `ref={{image}}:${sha}`, echo, `docker build -f
    {{infra_dir}}/Dockerfile -t "${ref}" {{repo_root}}`, `docker push "${ref}"`.
    No dirty-tree guard.
- `docs/discussions/0023-.../discovery.md` — frontmatter `status: proposed →
  worked`, `worklogs: [] → [0012-container-image-build-and-push]` (bidirectional
  link).

Root `justfile` unchanged: `just infra/publish-image` / `just infra/docker-auth`
already resolve via just's path syntax (same as the existing
`just infra/plan bootstrap`). Step 4's "wire from root" needs no aggregate-recipe
change for a standalone op.

### Checks run locally (no cloud mutation)

- `terraform fmt -recursive -check infra/` — clean (exit 0).
- `terraform -chdir=infra/prod validate` — Success.
- `terraform -chdir=infra/prod plan` — **1 to add, 0 to change, 0 to destroy**
  (the AR repository), plus `+ artifact_registry_repository =
  "asia-northeast1-docker.pkg.dev/siorie/siorie"` in Changes to Outputs. ADC
  and the GCS backend both worked on the first try.
- `just --dry-run infra/publish-image` — expands to the expected
  `docker build -f .../infra/Dockerfile -t asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha> <repo-root>`
  then `docker push`.
- **Local image build** (`docker build -f infra/Dockerfile -t
  siorie-app:localtest .`, engine = podman): succeeded in ~81 s. Result:
  ~32 MB, `User = 65532`, `Entrypoint = [/server]`, `ExposedPorts =
  8080/tcp`. `docker run --rm siorie-app:localtest` exits 1 with
  `GOOGLE_CLIENT_ID environment variable is required` — the binary is wired as
  entrypoint and fails fast exactly as designed (the proposal only asks that
  the image build and push, not that it start). Test image and the 5
  intermediate stage images were removed afterward; the `golang:1.27-bookworm`
  and distroless base images stay in the local podman store as cache.

### Blocked / left to the operator

- `terraform -chdir=infra/prod apply` — **denied by the Claude Code auto-mode
  classifier** ("Blocked by classifier"). Not retried or worked around. This
  is where the proposal's connectivity check begins, so the following are
  **not yet verified**:
  - `infra/prod/` apply succeeds; AR repository `siorie` exists in
    `asia-northeast1`.
  - `infra/prod/` re-`plan` is "No changes".
  - image `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha>` visible via
    `gcloud artifacts docker images list asia-northeast1-docker.pkg.dev/siorie/siorie`.
- `just infra/docker-auth` and the `docker push` half of `just
  infra/publish-image` — not run (outward-facing; `docker-auth` also mutates
  the user-global `~/.docker/config.json`). Left for the operator.

Operator steps to finish the connectivity check:

```
just infra/apply prod          # or: terraform -chdir=infra/prod apply
terraform -chdir=infra/prod plan   # expect: No changes
just infra/docker-auth         # once per machine
just infra/publish-image
gcloud artifacts docker images list asia-northeast1-docker.pkg.dev/siorie/siorie
```

### Operator-confirmed — connectivity check complete

The operator ran the steps above. `just infra/publish-image` succeeded and the
image is confirmed present in Artifact Registry (`asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha>`).
All of the proposal's connectivity conditions are now met. The podman
credential path (see Difficulties) therefore worked in practice — no fallback
`docker login` was needed.

## What was done

- Added the first real resource to `infra/prod/`: an Artifact Registry Docker
  repository (`siorie`, `asia-northeast1`) with a KEEP-only cleanup policy
  (`keep_count = 2`, `cleanup_policy_dry_run = true`) — retention intent only,
  no deletion until a DELETE policy is added in the Cloud Run topic.
- Added `infra/prod/outputs.tf` with the Docker path prefix (deviation: the
  proposal listed only the resource).
- Added `infra/Dockerfile` — multi-stage, `golang:1.27-bookworm` builder,
  `CGO_ENABLED=0` static build, `gcr.io/distroless/static-debian12:nonroot`
  final, Go binary only. Build context is the repo root; `-f` is mandatory.
- Added a repo-root `.dockerignore` scoped to what the Go build needs.
- Added `infra/justfile` `docker-auth` and `publish-image` recipes (SHA tag
  from `git rev-parse --short=12 HEAD`, no `:latest`, no dirty-tree guard),
  reachable from the repo root via just's path resolution.
- Verified locally: `terraform fmt`/`validate`/`plan` for `infra/prod/`, and a
  full `docker build` of `infra/Dockerfile` under podman producing a ~32 MB
  non-root image that runs and fails fast on missing env.
- `terraform apply` and the image push were run by the operator after the code
  was in place; the image is confirmed in Artifact Registry and every
  connectivity condition in the proposal is met.

## Difficulties

### The local Docker engine is podman, not Docker

The proposal, discussion 0023, worklog 0011's environment notes, and
`docs/design/repository-structure.md` all refer to "Docker" / "the operator's
Docker daemon" as an unchecked given. On this machine `/usr/local/bin/docker` is
**podman 6.1.0 emulating the Docker CLI** (rootless, native — no VM, no
`podman machine`). `docker build -f infra/Dockerfile -t ... .` worked unchanged
and the `publish-image` recipe is engine-agnostic (it only uses `build` and
`push`), so nothing had to change. But the divergences matter for whoever runs
the push:

- **Credential path.** `gcloud auth configure-docker
  asia-northeast1-docker.pkg.dev` (what `docker-auth` runs, and what the
  proposal's preflight documents) writes a `credHelpers` entry to
  `~/.docker/config.json`. podman's native credential store is
  `~/.config/containers/auth.json` (or `$XDG_RUNTIME_DIR/containers/auth.json`).
  podman *does* fall back to reading `~/.docker/config.json` and *does* honour
  `credHelpers`, and `docker-credential-gcloud` is on PATH (it ships in the
  gcloud SDK bin dir), so the documented path should work — but "should" is
  doing work here: it was **not verified**, because the push step is
  operator-only and was not run. If the operator's push fails on auth, the
  fix is likely `gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin asia-northeast1-docker.pkg.dev`
  (writes podman's own auth.json) rather than the credential helper.
- **Unqualified builder image.** The Dockerfile's final stage is
  fully-qualified (`gcr.io/distroless/...`) but the builder line is
  `FROM golang:1.27-bookworm`. Under Docker that is implicitly
  `docker.io/library/golang`; under podman it resolved only via a short-name
  alias in `registries.conf.d/00-shortnames.conf`. A podman config with
  `short-name-mode = enforcing` and no matching alias would prompt (breaking a
  non-interactive `just` run) or fail. Fully-qualifying to
  `docker.io/library/golang:1.27-bookworm` removes the ambiguity. Left
  unchanged here because the proposal explicitly specified
  `golang:1.27-bookworm` — flagging, not deciding.
- **Leftover images.** podman keeps each build stage as a `<none>` image in the
  local store (5 here, pruned afterward). Base images (`golang:1.27-bookworm`
  ~871 MB, distroless) stay cached.

This is the same *shape* of gap as worklog 0011's billing premise: a named
external dependency ("a billing account is linked" / "Docker is the engine")
treated as given rather than checked, surfacing only when a step touches it. It
is milder than 0011 — the build is engine-agnostic and podman's Docker
compatibility is good — but the auth path the proposal documents is
podman-untested. See Review.

### `terraform apply` for infra/prod was blocked by the auto-mode classifier

`terraform -chdir=infra/prod apply -auto-approve` was denied by the Claude Code
auto-mode classifier ("Blocked by classifier"). Not retried, not worked around
(per the denial guidance). Consequence: the proposal's connectivity check —
apply succeeds, re-plan clean, image visible in Artifact Registry — is
unverified at the time of writing and pending the operator. Everything up to
`plan` ran clean, so the remaining risk was low. The operator then ran `apply`
and `publish-image`, and the image is confirmed in Artifact Registry — the check
is now complete.

This is pure tooling friction (the classifier gates infra mutation), not a
design or assumption problem — unlike 0011, where the same class of step failed
for an environmental reason. The only real cost is a split of the "apply +
verify" step across the agent (code, `plan`) and the operator (`apply`, push).

### Preflight held up better than 0011

The proposal added an explicit preflight checklist as 0011's remedy. It paid
off: ADC is configured this time (`quota_project_id = siorie`), billing is
linked, `artifactregistry.googleapis.com` is enabled, and `infra/prod/` is
already `init`ed — so `terraform plan` was clean on the first attempt with no
mid-apply surprise. The one axis the checklist did not cover is the Docker vs
podman distinction (the checklist assumed "Docker engine present" as a yes/no).

### Minor

- **`infra/prod/outputs.tf` added.** The proposal's Artifact Registry section
  listed only the resource. Added one output for parity with
  `infra/bootstrap/` and to give the Cloud Run worklog a path value. No
  managed-resource effect; `terraform plan` shows it under "Changes to
  Outputs".
- **`.dockerignore` patterns.** The proposal sketched `*.tfstate*` and
  `**/.terraform`; used `*.tfstate` + `*.tfstate.*` + `**/.terraform` to match
  the existing `.gitignore` phrasing. Same effect.
- **`just --list` truncates multi-line recipe comments** to the last line, so
  `docker-auth` reads oddly there. Pre-existing house pattern (`apps/api`'s
  `dev` / `test` / `firestore-emulator` do the same); left for consistency.
- **`repository_id = "siorie"` inside project `siorie`** gives the
  triple-`siorie` path `asia-northeast1-docker.pkg.dev/siorie/siorie/app`, as
  the proposal anticipated and accepted. Harmless (AR paths always contain the
  project ID).
- **Repository name reconsidered post-apply, kept.** After seeing it work the
  operator raised `siorie/web/app` (mirroring the `siorie-web` OAuth client) as
  an alternative to the doubled `siorie/siorie`. Kept `siorie/siorie/app`: the
  image is the *unified* SPA+API Cloud Run service (0001), so a `web` namespace
  would under-describe it and there will never be a matching `siorie/api/...`;
  `repository_id` is also not updatable in place, so a rename means
  destroy/recreate. The proposal's round-3 already weighed the generic
  `containers/app` (option C) against the doubling and chose to accept it. If a
  rename is ever wanted, `containers/app` or `docker/app` reads better than
  `web/app`, and it is cheapest to do before more images accumulate.

## Review

Two recorded difficulties, one of which touches an assumption.

**podman vs Docker** is the one worth a second look. "Docker is the container
engine" runs through the proposal, discussion 0023, and the design doc as an
unchecked given, and the part that went unverified because of it — the
`gcloud auth configure-docker` → `~/.docker/config.json` credential path — is
exactly the path podman handles differently. It is the same shape as 0011's
billing-premise gap (external dependency assumed, not checked), one layer
milder. Whether this deserves its own `discovery.md` or just a note in `infra/`
("a Docker-compatible engine; podman works, but its credential/config paths
differ — see below") is a judgment call. My read: a doc note is probably
enough, because the build itself is engine-agnostic and the divergence is
confined to one preflight step — but it is the operator's call whether the
"Docker" assumption is load-bearing enough elsewhere (future Cloud Run local
testing, CI runners) to warrant a discovery.

**The classifier block on `apply`** is not a design signal — it is a fixed
tooling boundary. No discovery.

I did not create a discovery for either; that is the operator's to write.

**Disposition (operator's call):** no discovery. A doc note was added instead —
the "Deploy container image" comment block in `infra/justfile` now spells out
the podman credential-path fallback (with a direct `docker login` alternative)
and the unqualified `FROM golang:1.27-bookworm` short-name caveat. Revisit if
the "Docker" assumption turns out to be load-bearing in the Cloud Run local-test
or CI-runner topics.

