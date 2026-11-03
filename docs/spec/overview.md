# Overview

siorie is a small web app for keeping track of things you want to remember —
in practice, which manga you've read and how far. It is a Go API with a React
single-page app, deployed as one container on Google Cloud Run.

## Repository layout

```
apps/
  api/    Go HTTP API (module github.com/mitsuhitofujita/siorie/apps/api)
  web/    React SPA (Vite + TypeScript, pnpm)
infra/
  bootstrap/  platform/  app/   Terraform root modules
  Dockerfile                    the deploy image
  justfile                      terraform + image recipes
.github/workflows/deploy.yml    manual production deploy
justfile      repository entry point
mise.toml     tool versions
```

The repo is a monorepo with no pnpm workspace and no shared package directory:
the API and the SPA are independent modules with their own toolchains, build
output, and tests.

## How the parts connect

- **In production** a single Cloud Run service runs the Go binary. The binary
  serves the JSON API under `/api/*` and also serves the built SPA
  (`apps/web/dist`, baked into the image at `/web`) for every other path, with an
  `index.html` fallback for client-side routes. SPA and API therefore share one
  origin.
- **In local development** Vite serves the SPA on `http://localhost:5173` and
  proxies `/api/*` to the Go server on `http://localhost:8080`, so the browser
  still sees a single origin. The Go server runs against a local Firestore
  emulator.
- **Persistence** is Firestore. Users, sessions, groups, and items are all
  stored there; there is no other datastore.
- **Auth** is Google sign-in. The SPA gets a Google ID Token, the API verifies
  it and issues an opaque session cookie. See `authentication.md`.

## Data model

Everything a signed-in user owns hangs off their Google account ID (`sub`):

```
users/{sub}
users/{sub}/groups/{groupId}
users/{sub}/groups/{groupId}/items/{itemId}
sessions/{sha256(sessionId)}    (top-level; holds userId + timestamps)
```

A **group** has a name. An **item** has a title and a completed-volume count
(an integer). Groups and items are listed in creation order.

## Tooling

- The root `justfile` is the single entry point: `setup`, `dev`, `dev-static`,
  `build-web`, `dev-api`, `dev-web`, `dev-firestore`, `preview-web`, `build`,
  `test`, `lint`, `format`, `check`.
  Go recipes are delegated to `apps/api/justfile`; web recipes call the
  `package.json` scripts via `pnpm --dir apps/web`; `format` and `check` also run
  `terraform fmt` over `infra/`.
- `just check` runs format-check, lint, test, and build for both apps plus
  `terraform fmt -check`, and rewrites nothing. `just format` is the separate
  file-rewriting task.
- `mise.toml` pins Go, Node (LTS), pnpm, just, and Java (for the Firestore
  emulator); `gcloud` and Terraform are set to `latest`. `gh` is installed
  through mise's global config and also tracks `latest`.
