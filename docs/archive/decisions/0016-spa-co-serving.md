# 0016: SPA co-served from the Go binary, and an operator-passed APP_ORIGIN

Discussion: [SPA co-serving and the APP_ORIGIN fix](../discussions/0028-spa-co-serving/proposal.md)
(also settles [0025 Cloud Run app origin](../discussions/0025-cloud-run-app-origin/discovery.md))
Worklog: [Co-serve the SPA and use the real APP_ORIGIN](../worklogs/0016-spa-co-serving/plan.md)

## Status

Accepted; deployed and verified against the live service on 2026-09-03
(real Google sign-in, group creation, deep-link reload, cache headers).

Supersedes the `APP_ORIGIN` construction in
[0015](0015-cloud-run-service.md): the value is no longer built from the
project number but passed by the operator as a variable.

## Decision

- **The deploy image carries the built SPA.** `infra/Dockerfile` gains a
  `node:24-bookworm` web stage (corepack + pnpm pinned by the repo's
  `packageManager` field, `pnpm install --frozen-lockfile` cached on the
  manifest/lockfile) whose `apps/web/dist` is copied to `/web` in the
  distroless final stage. `go:embed` was rejected: serving from disk keeps
  the Go and web builds order-independent.

- **The Go server serves it, gated on `WEB_ROOT`.** An optional,
  presence-triggered env (like `AUTH_DEV_LOGIN`): unset in local dev — Vite
  keeps serving and proxying, nothing is mounted — and `/web` in production
  (a fixed literal in `infra/app`, since the image layout fixes it). The
  handler is the router's NotFound fallback: unmatched `/api/*` stays a
  plain 404; existing files are served with `Cache-Control: immutable`
  under `/assets/` (content-hashed) and `no-cache` elsewhere; a missing
  `/assets/*` file is a 404, never index.html (a stale bundle must not
  receive HTML as a module); any other unmatched GET/HEAD gets index.html
  for BrowserRouter deep links. No startup existence check — a broken image
  just 404s per request (a `log.Fatalf` red deploy was rejected).

- **`APP_ORIGIN` is the service's real URL, passed by the operator** as a
  third default-less `-var app_origin` on every `infra/app` plan/apply
  (`terraform output cloud_run_url` supplies it). Deriving it from
  request headers was rejected (moves the CSRF anchor into the request);
  committing it to tfvars was rejected (asymmetric with
  `google_client_id`); reading the service back via a data source was not
  taken this round.

- **`publish-image` takes the OAuth client ID** and passes it as the
  `VITE_GOOGLE_CLIENT_ID` build arg, inlined into the bundle. The same ID
  is entered independently at apply time; a mismatch is a silent sign-in
  401 and is accepted without an automated check.

## Rationale

Same-origin serving of SPA and API from one Cloud Run service was the 0001
target picture; the image was named `app` for this from the start (0012).
Serving the SPA from the production origin is also the moment the
long-known `APP_ORIGIN` mismatch (0025) becomes load-bearing — sign-in
itself POSTs from that origin — so both had to land together. The
operator-passed literal is a deliberate symptom fix: it worsens the
per-deploy `-var` friction (now three), explicitly handed to
[discussion 0026](../discussions/0026-infra-per-deploy-inputs/discovery.md),
and the underlying "a service cannot know its own public origin" discomfort
stays open there.

## Follow-ups still open

- [0026 Infra per-deploy inputs](../discussions/0026-infra-per-deploy-inputs/discovery.md)
  — three mandatory `-var`s per apply, `google_client_id` entered twice,
  and (from this round's difficulties) nothing enforcing the
  publish-before-apply order or verifying the manual OAuth-origin
  registration, whose failure is silent in the UI.
- Artifact Registry DELETE cleanup policy, a local `docker run` recipe for
  the combined image, Cloud Monitoring and the billing budget — all still
  deferred.
