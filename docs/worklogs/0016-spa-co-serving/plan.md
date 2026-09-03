---
date: 2026-09-03
status: in-progress
discussions: [0028-spa-co-serving]
decisions: []
pr: null
---

# Co-serve the SPA from the Go binary and use the real APP_ORIGIN

Implements [discussion 0028](../../discussions/0028-spa-co-serving/proposal.md):
add a web build stage to `infra/Dockerfile` so the final image carries
`apps/web/dist`, teach the Go server to serve static files with an SPA
fallback for everything outside `/api/*`, and replace the wrong
project-number-built `APP_ORIGIN` (discussion 0025) with a default-less
`app_origin` Terraform variable holding the service's real URL.

Agent scope: write the code and Terraform, update `infra/justfile`, run
`just check` and `terraform fmt`/`validate`/`plan`. `publish-image`, `apply`,
the OAuth-origin preflight, and the browser 導通確認 are operator steps (same
split as worklogs 0012/0013/0015: the auto-mode classifier blocks
`terraform apply` for non-bootstrap layers, and the proposal's completion
criteria need a real Google sign-in in a browser).

## Preflight (checked before starting, 2026-09-03)

| Check | State |
| --- | --- |
| Node LTS pinned by `mise.toml` (`node = "lts"`) | resolves to v24.20.0 locally → web stage tag `node:24-bookworm` |
| `apps/web/package.json` `packageManager` | `pnpm@11.22.0` (corepack picks this up) |
| `.dockerignore` | already excludes `apps/web/node_modules` and `apps/web/dist`; keeps `apps/web` sources + `pnpm-lock.yaml` in context — no content change needed, only the stale "Go-only" comments |
| `data.google_project` references in `infra/app` | only the `APP_ORIGIN` construction — safe to delete |
| real Cloud Run URL for `app_origin` | `https://siorie-u6y3wdsaua-an.a.run.app` (worklog 0015 preflight; operator re-confirms via `terraform output cloud_run_url`) |

## Plan

1. `infra/Dockerfile`: add a `node:24-bookworm` web stage
   (`corepack enable` → `pnpm install --frozen-lockfile` cached on
   `package.json`+`pnpm-lock.yaml`, `ARG VITE_GOOGLE_CLIENT_ID` before the
   source copy, `pnpm build`); final stage adds `COPY --from=web /web/dist /web`.
2. `internal/server`: `Deps.WebRoot`; new `static.go` with the SPA handler
   registered via `router.NotFound` only when `WebRoot != ""`; table-driven
   tests in `static_test.go`.
3. `cmd/server/main.go`: read `WEB_ROOT` with plain `os.Getenv`
   (presence-triggered, like `AUTH_DEV_LOGIN`).
4. `apps/api/.env.example`: add empty `WEB_ROOT=` with a comment.
5. `infra/app`: add default-less `var.app_origin`; drop
   `data "google_project"`; `APP_ORIGIN` env → `var.app_origin`; add
   `WEB_ROOT=/web` env (fixed literal).
6. `infra/justfile`: `publish-image` gains a `google_client_id` argument
   passed as `--build-arg VITE_GOOGLE_CLIENT_ID=…`; deploy comment becomes
   the 3-`-var` form.
7. Verify: `just check`, `terraform fmt`/`validate`, local
   `docker build` of the combined image (build only — no push, no run;
   the proposal defers a `docker run` recipe).

## What was done

- `infra/Dockerfile`: added the `web` stage (`node:24-bookworm`, tag-pinned to
  the major `mise.toml`'s `node = "lts"` resolves to). Dependency layer first
  (`package.json` + `pnpm-lock.yaml`, `corepack enable && pnpm install
  --frozen-lockfile`), then `ARG VITE_GOOGLE_CLIENT_ID` → `ENV`, then the
  source copy and `pnpm build`. Final stage gained
  `COPY --from=web /web/dist /web`. Header comment updated ("Go binary only"
  is no longer true); same for the stale `.dockerignore` comments (content
  unchanged, as the proposal specified).
- `internal/server/static.go` (new): `spaHandler(webRoot)` registered via
  `router.NotFound` only when `Deps.WebRoot != ""`. Behavior exactly as
  proposed: `/api/*` → plain 404; existing file → `http.ServeFile` with
  `immutable` Cache-Control under `/assets/`, `no-cache` otherwise; missing
  `/assets/*` → 404 (never index.html); other missing GET/HEAD paths →
  index.html fallback with `no-cache`; non-GET/HEAD → 404. No startup check
  on `WEB_ROOT` (missing files just 404 per request). The candidate path is
  built from `path.Clean("/"+urlPath)` so `..` cannot escape `webRoot`.
- `internal/server/server.go`: `Deps.WebRoot` added; `NotFound` registration
  at the end of `NewRouter`.
- `cmd/server/main.go`: `WEB_ROOT` read with plain `os.Getenv`
  (presence-triggered like `AUTH_DEV_LOGIN`, unlike the three `requireEnv`
  vars).
- `internal/server/static_test.go` (new): table-driven tests over a
  `t.TempDir()` webRoot shaped like `apps/web/dist` — root, deep link,
  hashed-asset hit/miss, `/api/*` miss, non-GET miss, traversal — plus a test
  that the handler is not mounted when `WebRoot` is empty.
- `apps/api/.env.example`: `WEB_ROOT=` (empty; comment says local dev leaves
  it unset and production gets the image path from infra/app).
- `infra/app`: `var.app_origin` added (default-less, description as drafted in
  the proposal); `data "google_project" "this"` deleted (its only reference
  was the old `APP_ORIGIN` construction); `APP_ORIGIN` env →
  `var.app_origin`; `WEB_ROOT=/web` env added as a fixed literal. The stale
  "SPA is co-served in a later round" / "built value is WRONG" comments
  rewritten to describe the new arrangement.
- `infra/justfile`: `publish-image` now takes `google_client_id` and passes
  `--build-arg VITE_GOOGLE_CLIENT_ID=…`; the deploy comment shows the
  3-`-var` form and points `app_origin` at `just infra/output app`.
- Verified: `just check` green (Go fmt/vet/test/build incl. the new handler
  tests, web tests + `vite build`, `terraform fmt -check`);
  `terraform -chdir=infra/app validate` OK.
- Verified the Dockerfile end-to-end with a local, push-less build
  (`docker build … --build-arg VITE_GOOGLE_CLIENT_ID=dummy… -t
  siorie-app-buildcheck`), on podman 6.1.0 via the Docker CLI shim. All three
  stages built; the unqualified `node:24-bookworm` short name resolved fine
  (same as `golang:` has on this machine), corepack picked up `pnpm@11.22.0`
  from `packageManager` with no download prompt (non-TTY build), and
  `pnpm install --frozen-lockfile` + `pnpm build` succeeded. Extracted `/web`
  from a created container: `index.html` + `assets/index-*.js/.css`,
  world-readable (0644/0755), so the `nonroot` runtime user can serve them.
  Verification image and container removed afterwards. This does not replace
  the deferred `docker run` recipe (the proposal's "first real check is the
  production apply" caveat stands for the serving path, though the handler
  itself is unit-tested).

## Difficulties

- **`http.ServeFile` rejects `..` paths with 400 before our fallback logic
  runs.** The handler cleans the request path itself
  (`path.Clean("/"+p)`), so the planned test "a traversal path falls back to
  index.html" was wrong in its expectation: `net/http` has its own
  `containsDotDot` guard and answers `400 invalid URL path` first. Harmless
  (defense in depth, browsers never emit such paths), but the test now
  asserts 400, not a 200 fallback. Worth remembering: with `http.ServeFile`
  you get a second, earlier traversal guard whose observable status differs
  from the handler's own.

- **The first production apply ran before `publish-image` and failed with
  "Image … app:dee0c8b9243d not found".** The operator went straight to
  `just infra/apply app` with `image_tag=$(git rev-parse --short=12 HEAD)`;
  Artifact Registry still held only the old `e28e643b6768` (worklog 0012).
  The failure mode is worth recording: Cloud Run's *spec* had already been
  updated (the new `WEB_ROOT` / real `APP_ORIGIN` env were visible on the
  service) but the new revision could not pull the image, so the service sat
  at `Ready: False` while the previous revision kept serving traffic — a
  half-applied state Terraform reports as an error, not a rollback. The
  deploy sequence in infra/justfile's comment (publish first, then apply) is
  load-bearing, and nothing enforces it; this is more fuel for discussion
  0026's per-deploy-inputs friction (a wrong/missing tag is only caught at
  apply time, inside the Cloud Run update).
- Recovery: committed the implementation first (so the image tag matches the
  tree it was built from — the tree had been dirty, and a
  `dee0c8b9243d`-tagged image with uncommitted contents would have lied),
  then `just infra/publish-image <client-id>` pushed `app:29025c3a738b`. The
  OAuth client ID was recovered from the live service's `GOOGLE_CLIENT_ID`
  env rather than asked for. The re-apply with the new tag is the operator's
  step (the auto-mode classifier blocks `terraform apply` for non-bootstrap
  layers, as in worklogs 0012/0013/0015).

## Operator steps

- `just infra/apply app -var image_tag=dee0c8b9243d …` — **failed**, image
  never published (see Difficulties). Service spec updated, revision failed,
  old revision kept serving.
- `just infra/publish-image <client-id>` → `app:29025c3a738b` pushed.
- Re-apply with `image_tag=29025c3a738b` succeeded (operator). Serving-side
  checks from the proposal all pass (`curl -I` against the live service):
  `/` and `/groups/<id>` → 200 `text/html` with `no-cache`; a live hashed
  asset → 200 with `public, max-age=31536000, immutable`; a missing
  `/assets/*` → 404; an unregistered `/api/*` → 404.
- **Sign-in failed in production: the OAuth-origin preflight had not taken
  effect.** After deploy, completing the Google flow always bounced back to
  `/login`. Cloud Run logs showed `GET /api/me` → 401 and *zero*
  `POST /api/auth/google` — the failure was entirely client-side, before any
  credential reached the server. Browser network capture pinned it: the GIS
  button iframe request (`accounts.google.com/gsi/button?...client_id=…`)
  returns **403**, i.e. the production origin
  `https://siorie-u6y3wdsaua-an.a.run.app` is not (effectively) registered
  as an authorized JavaScript origin for the OAuth Web client. The proposal
  listed this Console registration as preflight; it is manual (decision
  0022) and nothing in the deploy chain verifies it. Note the failure is
  silent in the UI — the button renders normally and the SPA shows no
  error. Fix: add the origin in Google Cloud Console (APIs & Services →
  Credentials → the Web client → Authorized JavaScript origins); Google
  documents propagation as 5 minutes to a few hours. Retest afterwards.
- After the operator registered the origin in the Console, the full flow
  passed (2026-09-03): real Google sign-in from the production origin,
  navigation to `/groups`, and group creation (the `POST /api/groups`
  Origin check against the now-correct `APP_ORIGIN`). With the earlier
  `curl -I` serving checks, every completion criterion in proposal 0028 is
  met. This round is done; `/decide` is the next step.
