# 0012: Container images — single Artifact Registry repo, workstation build-and-push

Discussion: [Container image build and push](../discussions/0023-container-image-build-and-push/proposal.md)
Worklog: [Container image build-and-push path and Artifact Registry](../worklogs/0012-container-image-build-and-push/plan.md)

## Status

Accepted. Settles the "how" that
[the initial tech-stack proposal](../discussions/0001-purpose-and-initial-tech-stack/proposal.md)
left open for getting a deployable container into Artifact Registry. It does
**not** settle CI/CD service selection (still open in
[discussion 0003](../discussions/0003-cicd-service-selection/proposal.md)) and
adds no runtime — Cloud Run, runtime IAM, the Firestore database, the budget,
and Cloud Monitoring stay in later topics.

Superseded in part by [0017](0017-github-actions-manual-deploy.md)
(2026-09-04): the CI/CD selection this decision left open is settled (GitHub
Actions + WIF), and workstation build-and-push is no longer the normal path —
the deploy workflow builds and pushes on the runner as `deployer`, with the
workstation path kept for rollback. The repository, image name, tagging rule
(short commit SHA, no `:latest`), and the Dockerfile layout are unchanged.

## Decision

- **One Artifact Registry Docker repository**, `siorie`, in `asia-northeast1`,
  managed by the `infra/prod/` layer — its first real resource. Images are
  referenced as `asia-northeast1-docker.pkg.dev/siorie/siorie/app` (image name
  `app`, not `api`, because it is the whole deployable and gains the SPA later).
  The doubled `siorie/siorie` is the project-id / repository-id overlap and is
  accepted; Artifact Registry paths always contain the project id, and a
  component name (`web` / `api`) would misdescribe a deliberately unified image.

- **Build and push from a workstation**, not Cloud Build. `just
  infra/publish-image` runs `docker build -f infra/Dockerfile <repo-root>` then
  `docker push` against the operator's local container engine. GCP auth is the
  operator's own credentials (ADC for Terraform; `gcloud auth configure-docker`
  or a user OAuth token for the push) — no service-account keys, per
  [0001](0001-monorepo-scaffold.md).

- **Image tag is the 12-character short commit SHA**, no `:latest`. The recipe
  does not check for a clean working tree: building from the intended commit is
  the operator's responsibility, and a SHA tag is mutable (re-pushing one SHA
  from a different tree overwrites).

- **`infra/Dockerfile` is multi-stage and lives in `infra/`** as deploy
  machinery, not app code: a `golang:1.27-bookworm` builder producing a
  `CGO_ENABLED=0` static binary, and a
  `gcr.io/distroless/static-debian12:nonroot` final stage holding only that
  binary. The build context is the repository root and `-f` is mandatory
  (`docker build .` will not work). A repo-root `.dockerignore` scopes the
  context. SPA co-serving is a separate topic; when it lands the builder gains a
  web stage and the final stage copies `apps/web/dist`.

- **Cleanup policy is KEEP-only for now**: one
  `most_recent_versions { keep_count = 2 }` KEEP policy with
  `cleanup_policy_dry_run = true`. A KEEP policy alone deletes nothing — it only
  records the retention intent. The DELETE policy that enforces it, and flipping
  `cleanup_policy_dry_run` off, are deferred to the Cloud Run topic, when images
  start accumulating.

- **A Docker-compatible engine is assumed, not pinned.** The engine sits outside
  `mise`'s version control. podman (Docker CLI emulation) works — `build` and
  `push` behave identically — but its credential store and image short-name
  resolution differ from Docker's; that divergence and a fallback (`docker
  login` with `gcloud auth print-access-token`) are documented in
  `infra/justfile` rather than given their own decision.

## Rationale

Workstation `docker` keeps Cloud Build out of the picture — its adoption was
withdrawn in discussion 0003 — while still making "an image exists in Artifact
Registry" true, which is the one precondition the downstream Cloud Run IaC
needs. A single repository is all a one-service project needs. SHA-only tags
make "what is deployed" unambiguous at the cost of a convenient floating
pointer, which a later CI/CD workflow can reintroduce on purpose. Shipping the
KEEP policy without its DELETE half fixes the retention shape before anything
depends on it. Keeping the image Go-only for now avoids pulling the unsettled
SPA-co-serving design into this step.
