# siorie
A simple web app for saving and organizing things you want to remember.

## Development

This repository is a monorepo containing a Go API (`apps/api`) and a React SPA (`apps/web`), managed from the repository root with [just](https://github.com/casey/just).

### Requirements

Tool versions are managed with [mise](https://mise.jdx.dev/). Install the pinned versions of Go, Node.js, pnpm, and just with:

```sh
mise install
```

### Setup

```sh
just setup
```

### Development servers

Run the API and Web dev servers in separate terminals:

```sh
just dev-api
just dev-web
```

### Checks

```sh
just check
```

Runs format checking, static analysis, tests, and the build for both the API and Web app. Run `just format` first to apply formatting.

## Deployment

Production is a single Cloud Run service on Google Cloud, managed by Terraform under `infra/` (see `docs/design/repository-structure.md`). A deploy builds the image from the checked-out commit, pushes it to Artifact Registry, and applies `infra/app` with that commit's short SHA as the image tag.

### From GitHub Actions (the normal path)

The `deploy` workflow (`.github/workflows/deploy.yml`) is started by hand and only from `main`:

```sh
gh workflow run deploy.yml --ref main
gh run watch
```

or from the Actions tab: **deploy** → **Run workflow** → branch `main`. The run executes `just check` as a gate, then builds and pushes the image, then applies `infra/app`. It authenticates as the `deployer` service account through Workload Identity Federation (GitHub OIDC); no service-account keys exist.

One-time setup, already done for this repository and recorded here for a rebuild: apply `infra/bootstrap` (the Workload Identity pool and the deployer bindings) and `infra/platform` (the deployer's roles); create the GitHub Environment `production` with a deployment-branch policy allowing only `main`; add the Environment secrets `GOOGLE_CLIENT_ID` (the OAuth Web client ID) and `APP_ORIGIN` (the service URL, `just infra/output app` → `cloud_run_url`). If the Cloud Run URL ever changes, update `APP_ORIGIN`.

### From a workstation (rollback and fallback)

```sh
just infra/docker-auth                 # once per machine
just infra/publish-image <client-id>   # builds and pushes app:<short SHA of HEAD>
just infra/apply app \
  -var image_tag=<sha> \
  -var google_client_id=<client-id> \
  -var app_origin=<cloud-run-url>
```

To roll back, apply with an older `image_tag` that still exists in Artifact Registry. `infra/bootstrap` and `infra/platform` are always applied from a workstation.
