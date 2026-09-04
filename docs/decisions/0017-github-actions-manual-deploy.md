# 0017: Manual production deploy from GitHub Actions via Workload Identity Federation

Discussion: [GitHub Actions manual deploy](../discussions/0029-github-actions-manual-deploy/proposal.md)
(also settles [0003 CI/CD service selection](../discussions/0003-cicd-service-selection/proposal.md))
Worklog: [Manual deploy from GitHub Actions](../worklogs/0017-github-actions-manual-deploy/plan.md)

## Status

Accepted; live since 2026-09-04. The first dispatch failed on IAM
propagation (the operator dispatched between the two applies); the second
(run 33891738701, `main` @ `cc2089b125c3`) completed in under four minutes
and put revision `siorie-00004-mv5` on the service. Serving checks and the
bootstrap / platform re-plans are clean. The proposal's browser sign-in
criterion was not re-run after the CI deploy at the time of writing; the
image was built from the same client ID as the previously verified deploy.

Settles the CI/CD service selection parked in
[discussion 0003](../discussions/0003-cicd-service-selection/proposal.md):
GitHub Actions, with Workload Identity Federation. The non-binding direction
recorded in [0011](0011-terraform-iac-layout.md) becomes the decision, and
0011's "dormant `deployer` with no role bindings" is superseded in part —
the account now has bindings. Supersedes [0012](0012-container-image-build-and-registry.md)
in part: workstation build-and-push is no longer the normal path, only the
rollback and fallback path; the image layout, repository, and tagging rule
are unchanged.

## Decision

- **GitHub Actions is the CI/CD service.** One workflow,
  `.github/workflows/deploy.yml`, triggered only by `workflow_dispatch` and
  only from `main`. No push-triggered deploy and no push / PR CI yet; both
  are separate discussions. Cloud Build and the hybrid Actions-plus-Cloud
  Build shape stay excluded (0003, 0023).

- **One job, a thin wrapper over the existing `just` recipes:** `just check`
  as the gate (before any credential is minted), then
  `just infra/publish-image`, then `just infra/init app` and
  `just infra/apply app -auto-approve`. `image_tag` is
  `git rev-parse --short=12 HEAD` of the checked-out commit — the same
  expression `publish-image` tags with — so the pushed and applied tags
  cannot diverge, and one `GOOGLE_CLIENT_ID` value feeds both the build arg
  and the Terraform variable. `concurrency: deploy` queues, never cancels.
  Re-dispatching a commit is idempotent apart from the pre-existing
  `infra/app` `scaling {}` no-op diff.

- **Identity: GitHub OIDC → WIF → `deployer`, no keys.** The token is
  exchanged at pool `github` / provider `github-actions`, whose attribute
  condition admits only `mitsuhitofujita/siorie` on `refs/heads/main`, and
  then impersonates the `deployer` service account. Direct WIF (no service
  account) was rejected to keep the identity recorded in 0011 and stable in
  IAM and audit logs. There is no local impersonation of `deployer`.

- **Placement follows the layers of 0014.** `bootstrap` holds *who may
  become* `deployer` and *which state it may touch*: the pool, the provider,
  `roles/iam.workloadIdentityUser`, `roles/storage.objectUser` on the state
  bucket conditioned on the `app/` prefix, plus an unconditional
  `roles/storage.legacyBucketReader` because `terraform init` lists the
  bucket and `storage.objects.list` is a bucket-level permission an
  object-name condition cannot grant (object *names* across the bucket are
  visible to `deployer`; `platform` contents are not). `platform` holds
  *what it may do*: `roles/artifactregistry.writer` on the repository,
  `roles/iam.serviceAccountUser` on the runtime SA, project-level
  `roles/run.admin` (the `app` layer also manages the `allUsers` invoker
  binding, and a per-service grant from `app` would have `deployer` grant
  itself). `app` is unchanged. `bootstrap` and `platform` stay human-only.

- **Per-deploy inputs on the CI path come from GitHub Environment
  `production` secrets** (`GOOGLE_CLIENT_ID`, `APP_ORIGIN`), with a
  deployment-branch policy of `main` only and no required reviewers (one
  operator; the dispatch is the approval). Secrets, not repository
  variables, because the repository is public and run logs are
  world-readable — only secrets are masked. Committing the values to
  `terraform.tfvars` and deriving `APP_ORIGIN` at run time were rejected.

- **The workstation path stays as the rollback path**, unchanged: the same
  recipes with an older `image_tag`. `infra/prod/` is gone for good
  (directory, import blocks, ignore rules).

## Rationale

0003 had already narrowed the choice to GitHub Actions versus a Google-side
builder and parked it until the IaC layers existed; 0011 and 0014 then
shaped `bootstrap` and `platform` so that a CI identity could be added
without reshaping them. This round cashes that in with the smallest useful
automation: a manual dispatch that runs exactly what an operator would run,
so the local and CI paths cannot drift, and with the credential and branch
gates placed where a forged or off-branch token is rejected before IAM is
consulted. The CI path also removes two of discussion 0026's frictions for
routine deploys (`image_tag` is derived, the other two inputs are entered
once) without touching the local path, which is why 0026 stays open.

## Follow-ups still open

- [0026 Infra per-deploy inputs](../discussions/0026-infra-per-deploy-inputs/discovery.md)
  — the workstation path still needs all three `-var`s.
- [0030 Infra apply handoff](../discussions/0030-infra-apply-handoff/discovery.md)
  — the agent / operator split on `terraform apply` and the dispatch race
  it caused this round.
- Push-triggered deploy and push / PR CI — each a future discovery; the WIF
  condition and the gate are reusable as they are.
- The perpetual `scaling {}` diff on `google_cloud_run_v2_service.app`
  (every apply reports one change); `APP_ORIGIN` as a hand-maintained
  secret that goes stale if the service URL changes; actions pinned by
  major tag with no Dependabot; the browser sign-in check after a CI
  deploy is still manual.
