# Repository Structure

## Overview

This repository is a monorepo. Runnable applications live under `apps/`: `apps/api` (Go) and `apps/web` (React). The root `justfile` is the single entry point for setup, development, build, test, lint, and format tasks.

```text
.
├── apps/
│   ├── api/
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── googleauth/       # Google ID Token verification
│   │   │   ├── server/           # router, hello + auth + group + item handlers, SPA static serving
│   │   │   └── store/            # Firestore-backed users/sessions/groups/items
│   │   ├── .env.example
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── justfile
│   └── web/
│       ├── src/
│       │   ├── components/       # layout, route guards (RequireAuth/RequireGuest), shared states (empty/error), hand-written UI primitives (Button, Dialog, Sheet, TextField, Avatar, Skeleton)
│       │   ├── lib/               # auth (Google Identity Services + GoogleSignInButton), api client, data-fetch/submit hooks, utils
│       │   ├── pages/             # RootRoute (/ redirect-only), LoginPage, groups/ (list/detail/new/edit), groups/items/ (detail/new/edit)
│       │   ├── test/              # setup.ts, renderWithProviders.tsx
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── .env.example
│       ├── .prettierrc.json
│       ├── .prettierignore
│       ├── eslint.config.js
│       ├── index.html
│       ├── package.json
│       ├── pnpm-lock.yaml
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── docs/
│   ├── discussions/
│   ├── worklogs/
│   ├── decisions/
│   └── design/
├── infra/
│   ├── bootstrap/           # root module: project API enablement, GCS state bucket, dormant deployer SA
│   │   ├── versions.tf
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── terraform.tfvars       # project_id, region — committed
│   │   ├── .terraform.lock.hcl    # committed
│   │   └── terraform.tfstate      # local state — committed
│   ├── platform/            # root module: GCS backend; Artifact Registry, Firestore (default), runtime SA + roles/datastore.user
│   │   ├── versions.tf
│   │   ├── backend.tf              # prefix = "platform"
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf              # artifact_registry_repository path prefix
│   │   ├── terraform.tfvars
│   │   └── .terraform.lock.hcl    # committed
│   ├── app/                 # root module: GCS backend; Cloud Run service + public invoker; reads platform via data sources
│   │   ├── versions.tf
│   │   ├── backend.tf              # prefix = "app"
│   │   ├── main.tf
│   │   ├── variables.tf            # image_tag, google_client_id, app_origin — default-less -vars
│   │   ├── outputs.tf              # cloud_run_url
│   │   ├── terraform.tfvars
│   │   └── .terraform.lock.hcl    # committed
│   ├── prod/                # retired: state migrating to platform/ + app/ by import; directory removed in a follow-up commit
│   ├── Dockerfile           # multi-stage build of the deploy image (Go binary + built SPA)
│   └── justfile
├── .dockerignore
├── .gitignore
├── justfile
├── mise.toml
└── README.md
```

## `apps/api`

A single Go module (`github.com/mitsuhitofujita/siorie/apps/api`) using chi as the router and Huma to produce typed, OpenAPI-reflectable handlers.

- `cmd/server/main.go` reads `PORT` (falling back to `8080` locally), `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, and `FIRESTORE_PROJECT_ID` (all three required, `log.Fatalf` if unset), and the optional `AUTH_DEV_LOGIN` (development-only) and `WEB_ROOT` (production-only, presence-triggered), starts the HTTP server, and shuts it down gracefully on `SIGINT`/`SIGTERM`. When `AUTH_DEV_LOGIN=1` it logs a startup `WARNING`, swaps the real Google verifier for a `googleauth.FakeVerifier` returning fixed `dev-test-user` claims, and sets `server.Deps.DevLogin` (so the dev-login route is mounted); anything else leaves both untouched.
- `internal/server` builds the router: `GET /api/hello` (JSON greeting); the auth endpoints
  `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/me` (and, only when
  `server.Deps.DevLogin` is set, the development-only `POST /api/auth/dev-login` — a plain chi
  route, not a `huma.Register` operation, so a JS-free top-level HTML form navigation can submit
  it; it reuses the real Google route's `Origin` check and session-issuing chain via the shared
  `establishSession` helper and answers with a `302` to `/`); the group endpoints
  `GET/POST /api/groups`, `GET/PATCH/DELETE /api/groups/{groupId}`; and the item endpoints
  `GET/POST /api/groups/{groupId}/items`,
  `GET/PATCH/DELETE /api/groups/{groupId}/items/{itemId}`, all registered via `huma.Register`
  using Huma's `cookie:`/`header:` struct tags for the `__Host-session` cookie and `Origin`
  validation. Group and item handlers resolve the caller's `userID` from the session cookie via a
  shared `authenticateSession` helper (factored out of the `GET /api/me` handler) and scope every
  Firestore path to that ID; state-changing group and item routes validate `Origin` like the auth
  routes. Every item handler first resolves `groupId` through a shared `requireGroup` helper
  (wrapping `GetGroup`), so a missing or foreign `groupId` returns 404 before the item store is
  touched. When `Deps.WebRoot` is set (production: `/web`, where the deploy image bakes
  `apps/web/dist`), `internal/server/static.go` registers the router's NotFound fallback:
  unmatched `/api/*` stays a plain 404; existing files are served with
  `Cache-Control: public, max-age=31536000, immutable` under `/assets/` (content-hashed) and
  `no-cache` elsewhere; a missing `/assets/*` file is 404 (never index.html); any other
  unmatched GET/HEAD gets `index.html` for BrowserRouter deep links. Unset in local dev
  (Vite serves the frontend), and there is no startup existence check — a broken `WEB_ROOT`
  just 404s per request.
- `internal/googleauth` verifies Google ID Tokens (signature, `aud`, `iss`, `exp`) behind a `Verifier` interface, wrapping `google.golang.org/api/idtoken`. `FakeVerifier` (fixed claims, ignores the token) backs the fast handler tests and is also swapped in at runtime when `AUTH_DEV_LOGIN=1`.
- `internal/store` persists users, sessions, groups, and items in Firestore (`users/{sub}`,
  `sessions/{sha256(sessionId)}`, `users/{sub}/groups/{groupId}`,
  `users/{sub}/groups/{groupId}/items/{itemId}`) behind
  `UserStore`/`SessionStore`/`GroupStore`/`ItemStore` interfaces; `FirestoreStore` is the real
  implementation (auto-detects the local emulator via `FIRESTORE_EMULATOR_HOST`), `MemoryStore`
  is an in-memory double used by fast handler tests. `GroupStore` and `ItemStore` methods are
  entity-qualified (`ListGroups`/`CreateGroup`/…,
  `ListItems`/`CreateItem`/`GetItem`/`UpdateItem`/`DeleteItem`) rather than bare verbs, since Go
  has no method overloading and both stores hang off the same structs. Groups and items are
  listed in creation order. `DeleteGroup` removes the group's `items` subcollection before the
  group document, both steps idempotent so a retried delete is safe; `DeleteItem` is a plain
  idempotent document delete with no cascade.
- `apps/api/.env` (loaded automatically via `just`'s `dotenv-load`; see `.env.example`) holds the server's local environment variables, including `FIRESTORE_EMULATOR_HOST` to point at the local Firestore emulator and the optional `AUTH_DEV_LOGIN=1` to enable the development-only Dev Login path.
- `apps/api/justfile` provides `setup`, `dev`, `firestore-emulator` (runs the local Firestore emulator on port 8090), `build`, `test` (starts its own throwaway Firestore emulator on port 8091 for the duration of the run), `lint` (`go vet`), `format` (`gofmt -w`), `format-check`, and `check` (`format-check` → `lint` → `test` → `build`), all independent of the caller's working directory.

## `apps/web`

A Vite + TypeScript + React application managed with pnpm as the only package manager; no pnpm workspace is used.

- The visual style is a bespoke design-token system in `src/index.css` (moss ×
  rounded-gothic): a moss colour palette, a φ-based type scale, Fibonacci-px
  spacing, and `8·φⁿ` radius, all as CSS custom properties, with the component
  styles in an `@layer components` block consumed as semantic classes
  (`className="btn btn-primary"`). Mobile-only, light-only, a single centred
  column ≤ 430 px with a hairline side border on wider viewports; `/` and
  `/login` render outside the common layout. shadcn/ui is not used — `src/components/`
  holds hand-written `Button`, `Dialog`, `Sheet`, `TextField`, `Avatar`, and
  `Skeleton` on the tokens, wrapping the Radix primitives (Dialog, Label,
  Avatar) kept for behaviour. Tailwind v4 remains as the build pipeline plus a
  `@theme` colour map and a few layout utilities. UI copy is English. Every
  string — chrome and user-entered content (group / item names, the signed-in
  user's name) alike — renders in one OS rounded-gothic stack (`--font`); no
  web font is bundled or fetched, so rounded rendering is best-effort (Apple
  and Windows have it; elsewhere it falls back to a plain system sans).
- Auth-state screen switching happens at the route layer, not inside a page. `src/App.tsx` maps
  `/` to `src/pages/RootRoute.tsx` (no UI: a minimal skeleton while auth is `loading`, otherwise
  `<Navigate>` to `/groups` or `/login` — the one place `loading` is handled explicitly), `/login`
  to `src/pages/LoginPage.tsx` wrapped in `<RequireGuest>`, and the `AppLayout` route element
  (everything under `/groups`) wrapped once in `<RequireAuth>`. `RequireAuth` sends a settled
  `unauthenticated` visitor to `/login`; `RequireGuest` sends a settled `authenticated` visitor to
  `/groups`; both are in `src/components/route-guards.tsx`. There is no authenticated home page —
  the signed-in user's name shows in the `NavMenu` sheet.
- The route table's URLs nest to match the Firestore data model: `/groups`, `/groups/new`,
  `/groups/:groupId` (detail), `/groups/:groupId/edit`, and the
  `/groups/:groupId/items/{new,:itemId,:itemId/edit}` equivalents. Create and edit are always
  separate pages (a create page has no loading state; an edit page fetches its initial data via a
  single-resource `GET` and shows a skeleton meanwhile). Every route except `/` and `/login` renders
  inside `src/components/layout/AppLayout.tsx` (header: wordmark linking to `/` + account avatar;
  footer: app name only), whose avatar opens `NavMenu`. There are no per-page back links —
  upward / return navigation is the browser back button and the header wordmark. Deletion is
  initiated from an edit page through `src/components/DeleteConfirmDialog.tsx` (a custom modal,
  never `window.confirm`), not from the list; on the edit pages the delete button sits below a
  full-width hairline, right-aligned. List pages show `Skeleton` while loading and
  `src/components/EmptyState` (a fixed message; its create CTA is an optional prop the two list
  pages omit, since the create action lives in the page's section heading) when the result is
  empty. `src/lib/api.ts` is a thin typed `fetch` wrapper per endpoint;
  `src/lib/auth-context.ts` holds `AuthState` (`loading` / `unauthenticated` / `authenticated`,
  from `GET /api/me` on mount) and `useAuth`, kept out of `auth.tsx` so Fast Refresh's
  component-only-export rule holds.
- `src/lib/auth.tsx` (`AuthProvider`) loads the Google Identity Services script once, initializes
  `google.accounts.id` with `VITE_GOOGLE_CLIENT_ID`, and provides `{ state, gisReady, logout }`. It
  also exports `GoogleSignInButton`, a self-contained component that owns its container, calls
  `google.accounts.id.renderButton` into it once `gisReady`, and on unmount clears only its own
  container. `LoginPage` is the only place it is mounted. On sign-in the button's credential
  callback `POST`s to `/api/auth/google`, then re-checks `GET /api/me`; auth state flips to
  `authenticated`, `<RequireGuest>` navigates to `/groups`, and `LoginPage` unmounts (removing the
  button's `<div>` and Google's `<iframe>` with it). `logout()` calls `POST /api/auth/logout`.
  `LoginPage` additionally renders a plain `<form method="post" action="/api/auth/dev-login">`
  "Dev Login" button — no JS, no new frontend env var — but only when `import.meta.env.DEV`, so
  `vite build` strips it. It lets a browser end-to-end check sign in as the fixed dev user when
  the API runs with `AUTH_DEV_LOGIN=1`; the frontend gate and that server flag are independent.
- `src/lib/use-fetch.ts` (`useFetch`) and `src/lib/use-submit.ts` (`useSubmit`) are the
  shared data-access hooks every group/item page uses instead of ad-hoc
  `useState`/`useEffect`. `useFetch(fetcher)` returns an explicit
  `{ status: 'loading' | 'success' | 'error', data?, refetch }`, so a failed GET renders
  `components/ErrorState` (a fixed-message "Retry" component mirroring
  `components/EmptyState`) rather than a stuck skeleton. `useSubmit(action, message)` wraps
  a create/update/delete call as `{ isSubmitting, error, submit }`, where `submit` resolves
  to `{ ok: true; value } | { ok: false }`; a failed submit shows a fixed English message
  inline in the form, or inside `DeleteConfirmDialog` (which takes an optional `error` prop)
  for a failed delete. Error copy is always local and fixed — `apiFetch` still throws on
  status alone and never reads the failure body. `ItemDetailPage`'s "Add a volume" button is
  the one place a detail page issues a write: an optimistic `PATCH` of `completedVolume + 1`
  via `useSubmit`, rolled back on failure.
- `apps/web/.env` (see `.env.example`) holds `VITE_GOOGLE_CLIENT_ID`.
- `vite.config.ts` proxies `/api/*` to `http://localhost:8080` in dev, so `pnpm dev` and the Go API
  server present as one browser-visible origin (`http://localhost:5173`) — required for the
  `__Host-session` cookie and the `Origin` check to behave as they do in the single-origin Cloud Run
  deployment. The Go server's `APP_ORIGIN` must be set to this Vite origin for local dev, not its own
  port.
- Linting uses ESLint's flat config (`eslint.config.js`) with `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`.
- Formatting uses Prettier (`.prettierrc.json`, `.prettierignore`).
- Testing uses Vitest with `@testing-library/react`, `@testing-library/jest-dom`, and jsdom
  (`src/test/setup.ts`, which also registers `afterEach(cleanup)` since `@testing-library/react`'s own
  auto-cleanup only self-registers when `test.globals` is enabled, which this project does not do).
- `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`), `lint`, `format`, `format:check`, `preview`. The `packageManager` field pins the pnpm version used.

## `infra/`

Terraform Infrastructure as Code for Google Cloud, applied from a workstation
(no CI/CD automation yet), targeting a single production project (`siorie`,
`asia-northeast1`). Three root modules, split by how often each changes —
`bootstrap` (almost never), `platform` (rarely), `app` (every deploy) — with no
`modules/` or `environments/` directory. See decisions 0011, 0012, 0014, and
0015. `infra/` also holds the deploy `Dockerfile` (build machinery, not app
code).

- `infra/bootstrap/` — the layer that has to exist before any other. Enables the
  project's APIs (`google_project_service` over the set that bootstrap, the
  `platform` / `app` layers, and the planned GitHub Actions + Workload Identity
  Federation path all need), creates the Terraform state bucket
  (`siorie-tfstate`: `asia-northeast1`, versioned, uniform bucket-level access,
  public access prevention enforced, `prevent_destroy`, 30-day
  noncurrent-version cleanup), and creates a dormant `deployer` service account
  with **no** IAM role bindings. Keeps **local state, committed to the repo**
  (`terraform.tfstate`) — it creates the state bucket, so it cannot back itself
  with it; its state holds only non-secret facts. This is viable only while a
  single operator applies locally.
- `infra/platform/` — `backend "gcs"` (`prefix = "platform"`), a provider
  config, and the resources that change rarely: the
  `google_artifact_registry_repository` (`siorie`, `DOCKER`, `asia-northeast1`,
  KEEP-only cleanup policy — `most_recent_versions`, `keep_count = 2`,
  `cleanup_policy_dry_run = true`, retention intent only); the Firestore
  `(default)` database (`FIRESTORE_NATIVE`, `asia-northeast1`, App Engine
  integration disabled, point-in-time recovery off, guarded by GCP-side
  `delete_protection_state` **and** Terraform `prevent_destroy`, with the
  provider's `ABANDON` deletion-policy default on top); the `siorie-run` runtime
  service account; and `roles/datastore.user` on that SA
  (`google_project_iam_member`). `outputs.tf` exposes the Docker path prefix
  (`asia-northeast1-docker.pkg.dev/siorie/siorie`). A DELETE cleanup policy for
  the repository, the billing budget, and Cloud Monitoring are still deferred to
  later worklogs.
- `infra/app/` — `backend "gcs"` (`prefix = "app"`), a provider config, and the
  one thing that rolls on every deploy: the `google_cloud_run_v2_service`
  (`siorie`, `INGRESS_TRAFFIC_ALL`, `min 0 / max 1`, one container on `:8080`,
  env `GOOGLE_CLIENT_ID` / `APP_ORIGIN` / `FIRESTORE_PROJECT_ID` /
  `WEB_ROOT=/web`, the last a fixed literal matching the image layout) and its
  `allUsers` `roles/run.invoker` binding. It reads the Artifact Registry repo
  and the runtime SA back from GCP through `data` sources (not
  `terraform_remote_state`), so a plan needs only ordinary project read
  access; there is no cross-module `depends_on`, so when `platform` and `app`
  both change, `platform` is applied first. `image_tag`, `google_client_id`,
  and `app_origin` are default-less `-var`s (non-secret, kept out of the
  repo), so every `app` plan/apply needs all three; `bootstrap` and `platform`
  take none. `outputs.tf` exposes `cloud_run_url`, whose value is what the
  operator passes back in as `app_origin` (the service's real, legacy-hash
  URL; it cannot self-reference its own `.uri` — decision 0016).
- `infra/prod/` — the former single non-bootstrap layer, being retired: its four
  live resources (Artifact Registry repo, runtime SA, Cloud Run service,
  invoker) migrate into `platform` / `app` by `terraform import`, and the
  directory is deleted in a follow-up commit once the old state is released with
  `state rm` (never `terraform destroy`).
- `infra/Dockerfile` — multi-stage: a `golang:1.27-bookworm` builder producing a
  `CGO_ENABLED=0` static binary; a `node:24-bookworm` web stage (corepack +
  the `packageManager`-pinned pnpm, `pnpm install --frozen-lockfile` cached on
  the manifest/lockfile, `ARG VITE_GOOGLE_CLIENT_ID` inlined into the bundle
  by `vite build`); and a `gcr.io/distroless/static-debian12:nonroot` final
  stage holding the binary (`ENTRYPOINT ["/server"]`) plus the built SPA at
  `/web`. Build context is the repository root; `-f infra/Dockerfile` is
  mandatory. `.dockerignore` at the repo root scopes the context.
- `infra/justfile` — `init` / `plan` / `apply` / `output` recipes that take the
  layer name (`just infra/plan platform`), plus `format` / `format-check`, plus
  container recipes: `docker-auth`
  (`gcloud auth configure-docker asia-northeast1-docker.pkg.dev`, once per
  machine, not in `setup`) and `publish-image <google_client_id>` (build from
  the repo root with `--build-arg VITE_GOOGLE_CLIENT_ID`, push to Artifact
  Registry, tag = `git rev-parse --short=12 HEAD`, no `:latest`, no dirty-tree
  guard). The same client ID is entered again at apply time; a mismatch is a
  silent sign-in 401. Publish before apply — nothing enforces the order, and a
  missing tag fails only inside the Cloud Run update. All reachable from the repo root via just's cross-directory
  resolution. A Docker-compatible engine is assumed but not pinned by `mise`;
  podman works, with credential/short-name caveats noted in the `justfile`.
- `terraform.tfvars` (`project_id`, `region`) and `.terraform.lock.hcl` are
  committed for every layer; the `google` provider is pinned `~> 6.50`. Local
  apply uses the operator's own credentials (Application Default Credentials or
  an equivalent short-lived user OAuth token); no service-account keys. The
  image push uses the same operator credentials.

## Root

- `justfile` recipes: `setup`, `dev-api`, `dev-web`, `build`, `test`, `lint`, `format`, `check`. Go tasks are delegated to `apps/api/justfile` via just's cross-directory recipe resolution (e.g. `just apps/api/build`); Web tasks call the `package.json` scripts via `pnpm --dir apps/web`; `format` / `check` also run `terraform fmt` over `infra/` via `infra/justfile`. `check` runs format-checking, lint, test, and build for both apps and does not rewrite files; `format` is the file-rewriting task and is run separately.
- `mise.toml` pins the development versions of Go, Node.js, pnpm, just, gcloud, Java (for the Firestore emulator), and Terraform. Terraform is pinned to an exact version (not `latest`) for apply reproducibility.
- `.gitignore` excludes the generated `apps/api/bin/`, `apps/web/dist/`, `apps/web/node_modules/`, and the local `apps/api/.env` / `apps/web/.env` files, plus Terraform working directories, plan files, local state under the GCS-backed layers (`infra/prod/`, `infra/platform/`, `infra/app/`), and the bootstrap state backup — `infra/bootstrap/terraform.tfstate` and every `.terraform.lock.hcl` stay tracked.
- `.dockerignore` scopes the `infra/Dockerfile` build context (the repository root) down to what the Go and web builds need: it drops `.git`, `.claude`, node/web/Go build output (the web stage always installs and builds from source), Terraform working dirs and state, `docs/`, and env files.
- `docs/` holds the discussions/worklogs/decisions/design layout described in `docs/README.md`.

## Not yet present

Terraform manages `infra/bootstrap/`, `infra/platform/` (Artifact Registry,
Firestore `(default)`, the runtime SA and its `roles/datastore.user`), and
`infra/app/` (the Cloud Run service and its public invoker); the migration of
the live `infra/prod/` resources into `platform` / `app` by `import` is applied
by an operator and its follow-up cleanup commit is pending (see `infra/`). A
DELETE cleanup policy for the image repository, the billing budget, and Cloud
Monitoring are not managed yet, and there is no CI/CD automation. The deploy
image (`infra/Dockerfile`, Go binary + built SPA) is built and pushed by hand
from a workstation (`just infra/publish-image <client-id>`); there is no
recipe yet to `docker run` the combined image locally, so the co-serving path
is exercised only by unit tests and the production deploy. The OAuth Web
client is operated manually in the Google Cloud Console; the production origin
must be registered there as an authorized JavaScript origin, and nothing
verifies it (an unregistered origin fails silently in the UI). Google
authentication, Tailwind CSS, the moss design-token system, and the group and
item entity API endpoints have been introduced by later worklogs (see below);
the item-list endpoint currently returns every item with no pagination.

## Decisions

- [0001: Monorepo layout with independent Go API and React SPA modules](../decisions/0001-monorepo-scaffold.md)
- [0002: Google ID Token authentication with Firestore-backed sessions](../decisions/0002-google-id-token-auth.md)
- [0003: Group entity CRUD](../decisions/0003-group-entity-crud.md)
- [0004: Item entity CRUD](../decisions/0004-item-entity-crud.md)
- [0005: Form and fetch error feedback](../decisions/0005-form-and-fetch-error-feedback.md)
- [0006: Visual style system — moss × rounded gothic, shadcn/ui removed](../decisions/0006-visual-style-system.md)
- [0008: Route-level auth split and a self-contained GoogleSignInButton](../decisions/0008-route-level-auth-split.md)
- [0009: Frontend application structure — SPA routing, common layout, page conventions](../decisions/0009-frontend-app-structure.md)
- [0010: Style fit-and-finish — one font family, no in-app back links, section-head create actions](../decisions/0010-style-fit-and-finish.md)
- [0011: Terraform IaC layout — flat bootstrap + prod layers, committed bootstrap state](../decisions/0011-terraform-iac-layout.md) (superseded in part by 0014)
- [0012: Container images — single Artifact Registry repo, workstation build-and-push](../decisions/0012-container-image-build-and-registry.md)
- [0013: Development-only Dev Login path](../decisions/0013-dev-login-path.md)
- [0014: Infra deploy layers by change frequency, and the Firestore (default) database](../decisions/0014-infra-deploy-layers-and-firestore.md)
- [0015: Cloud Run service, public invoker, and a dormant runtime SA](../decisions/0015-cloud-run-service.md) (superseded in part by 0016)
- [0016: SPA co-served from the Go binary, and an operator-passed APP_ORIGIN](../decisions/0016-spa-co-serving.md)
