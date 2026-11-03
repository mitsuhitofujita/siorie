# Work log

Time-ordered record of what was built, reconstructed from `docs/archive/worklogs/`
and `docs/archive/decisions/`. One section per unit of work.

## Monorepo scaffold (2026-08-23)

- Created the monorepo: `apps/api` (Go module, chi router + Huma for typed
  OpenAPI-reflectable handlers, split into `cmd/server` and `internal/server`)
  and `apps/web` (Vite + TypeScript + React, pnpm). `apps/api` serves
  `GET /api/hello`; `apps/web` renders a placeholder screen. Each app keeps its
  own build, dependency, and test boundary.
- The root `justfile` is the single entry point (`setup`, `dev-api`, `dev-web`,
  `build`, `test`, `lint`, `format`, `check`); Go recipes live in
  `apps/api/justfile`, web recipes call the `package.json` scripts.
- No pnpm workspace and no shared `packages/` directory — deferred until a real
  second consumer exists rather than built speculatively. Build and dependency
  artifacts are gitignored.

## Frontend application structure (2026-08-23)

- Built the React SPA shell: `react-router-dom` with `src/App.tsx` as the single
  route table; URLs nest to match the Firestore data model (`/groups`,
  `/groups/new`, `/groups/:groupId`, `.../edit`, `/groups/:groupId/items/...`).
- Create and edit are always separate pages. A common `AppLayout` (header with
  title + account avatar, footer) wraps every route except `/`; the avatar opens
  a slide-in `NavMenu` sheet. Deletion is initiated from the edit page through a
  custom `DeleteConfirmDialog`, never `window.confirm`.
- Empty and loading are first-class states (`Skeleton`, `EmptyState`). A thin
  typed `fetch` client (`lib/api.ts`) has one wrapper per endpoint. Auth is a
  React context with a three-value `AuthState`
  (`loading | unauthenticated | authenticated`) from `GET /api/me` on mount.
- Tailwind CSS v4 and shadcn/ui introduced here. Only the frontend structure was
  built; backend endpoints, real Google sign-in, and Firestore access were left
  for later.

## Google authentication (2026-08-23)

- Implemented Google Identity Services ID Token sign-in end to end:
  `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/me`, backed by
  Firestore (`users/{sub}`, `sessions/{sha256(sessionId)}`).
- Sessions are opaque and server-side: a random ID goes to the browser in a
  `__Host-session` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
  30-day); only its SHA-256 hash is stored. The Go API verifies each token's
  signature, `aud`, `exp` (via Google's library) and `iss` (checked explicitly).
  No OAuth client secret is used anywhere.
- State-changing auth routes validate the `Origin` header against the app's own
  origin as CSRF defense. The frontend renders Google's own `renderButton()`
  output rather than a click-triggered `prompt()` (One Tap), which fails
  silently with no fallback. A Vite dev proxy makes `/api/*` share the SPA's
  origin locally.

## Group entity CRUD (2026-08-25)

- Shipped group CRUD end to end: `GET/POST /api/groups`,
  `GET/PATCH/DELETE /api/groups/{groupId}`, backed by a new `GroupStore`
  (`MemoryStore` + `FirestoreStore`), every method scoped by the authenticated
  user's `sub`. Store methods are entity-qualified (`ListGroups`, `CreateGroup`,
  …) because Go has no method overloading and `ItemStore` will hang off the same
  structs.
- A group name is required, 1–100 characters. `DELETE` removes the group's
  `items` subcollection first, then the group document, and always returns 204
  — idempotent, so a retried delete is safe.
- Frontend: a new `/groups/:groupId` detail page replaces
  `/groups/:groupId/items`; the list links each row to it; the edit page loads
  its initial data from the single-resource `GET` instead of fetching the list
  and calling `.find()`.
- Unauthenticated access to `/groups/**` gets no dedicated guard yet; a 401 is
  treated as a generic API-failure error state.

## Item entity CRUD (2026-08-27)

- Shipped item CRUD end to end: `GET/POST /api/groups/{groupId}/items`,
  `GET/PATCH/DELETE /api/groups/{groupId}/items/{itemId}`, backed by a new
  `ItemStore` following the `GroupStore` pattern, scoped by user and group
  (`users/{sub}/groups/{groupId}/items/{itemId}`); items listed in creation
  order.
- Every item handler resolves `groupId` through a shared `requireGroup` helper
  first (404 on missing or foreign), since Firestore subcollections don't
  require the parent document to exist.
- Title required, 1–100 characters; completed volume an integer ≥ 0. `DELETE`
  returns 204 whenever the group exists, including for an already-gone item.
- Frontend: a new `/groups/:groupId/items/:itemId` detail page mirroring the
  group one; item create, update, and delete all navigate to `/groups/:groupId`
  on success; `ItemEditPage` loads via `getItem`.

## Form and fetch error feedback (2026-08-28)

- A failed API call now always produces visible feedback, on both the write side
  (create/update/delete) and the read side (list/detail GET), replacing the
  earlier silent failure.
- Two shared hooks in `apps/web/src/lib/`: `useFetch(fetcher)` returns
  `{ status: 'loading' | 'success' | 'error', data?, refetch }`, so a failed
  load renders an error rather than a stuck skeleton; `useSubmit(action,
  message)` returns `{ isSubmitting, error, submit }` where `submit` resolves to
  a discriminated `{ ok: true; value } | { ok: false }`.
- A new `ErrorState` component mirrors `EmptyState` with a retry button. Error
  copy is fixed local text, never taken from the API response body.
  `DeleteConfirmDialog` gained an optional `error` prop. Edit pages seed their
  form state during render instead of in an effect.

## Flush passive effects before auth.test.tsx teardown (2026-08-29)

- Fixed a low-rate, load-only failure of `apps/web/src/lib/auth.test.tsx`
  (`Cannot read properties of undefined (reading 'accounts')`): a passive effect
  reached `window.google` after the synchronous `afterEach` had already removed
  the stub.
- The change is confined to the test file — `afterEach` is now `async` and runs
  `await act(async () => {})` before unstubbing globals, flushing pending
  effects while the stub is still installed. No product code changed.

## Route-level auth split and a self-contained GoogleSignInButton (2026-08-29)

- Moved auth-state screen switching out of `HomePage`'s early returns into the
  route layer: `/` → `RootRoute` (redirect-only, the one place `loading` is
  handled), `/login` → `LoginPage` wrapped in `<RequireGuest>`, and the
  `/groups/*` tree wrapped once in `<RequireAuth>`. The guards live in
  `components/route-guards.tsx`.
- `GoogleSignInButton` is a new self-contained component exported from
  `@/lib/auth`; it owns its container and clears only that container on unmount,
  so Google's injected `<iframe>` can't be orphaned across the sign-in
  transition. `AuthContextValue.renderSignInButton` is replaced by
  `gisReady: boolean`.
- `HomePage` and its test are deleted; there is no authenticated home. The
  signed-in user's name moved to the `NavMenu` sheet. This adds a real `/login`
  route and makes `/` redirect-only.

## Visual style overhaul: moss × rounded gothic (2026-08-29)

- Replaced the shadcn/ui token set in `index.css` with a bespoke design-token
  system: a moss palette (all functional pairs clear WCAG AA), a φ-based type
  scale, Fibonacci-px spacing, `8·φⁿ` radius, pill buttons. Mobile-only,
  light-only, one centred column ≤ 430 px with a hairline side border on wider
  viewports.
- Removed shadcn/ui and `class-variance-authority`. `Button`, `Dialog`, `Sheet`,
  `TextField`, `Avatar`, `Skeleton` are hand-written on the tokens, keeping the
  Radix primitives (Dialog, Label, Avatar) for behaviour. Component styles live
  in an `@layer components` block used as semantic classes.
- All UI copy is English; the rounded display face (Zen Maru Gothic, Latin
  subset) is self-hosted via `@fontsource`, with user-entered content in the OS
  gothic.
- item-detail gained an optimistic "Add a volume" increment — the one write
  action allowed on a detail page.

## Style fit-and-finish (2026-08-29)

- Nine adjustments after living with the moss UI. Collapsed `--font` /
  `--font-ugc` into one OS rounded-gothic stack and dropped
  `@fontsource/zen-maru-gothic` — no web font is bundled or fetched; rounded
  rendering is now best-effort.
- Added a `Button` `size="xs"` for buttons sitting in a `.sectionhead` next to a
  heading, baseline-aligned; `/groups` now uses a section head like the
  group-detail heads.
- Removed every in-app back link — upward navigation is the browser back button
  plus the header wordmark, now a `<Link to="/">`. The create action lives only
  in the section heading, shown even when the list is empty; `EmptyState`'s CTA
  is now optional. Item rows get a fixed three-digit right-aligned `vol.`
  column; edit-page delete buttons sit below a full-width hairline,
  right-aligned.

## Terraform GCP bootstrap layer (2026-08-30)

- Added `infra/`, managed with Terraform, applied from a workstation with the
  operator's own credentials — no service-account keys; the GCP project is
  created by hand.
- `infra/bootstrap/` keeps local, committed state (it creates the state bucket,
  so it can't back itself with it): enables the project APIs bootstrap, the prod
  layer, and the planned CI/CD path need; creates the `siorie-tfstate` GCS
  bucket (`asia-northeast1`, versioned, uniform bucket-level access,
  public-access-prevention enforced, `prevent_destroy`, 30-day noncurrent
  cleanup); creates a dormant `deployer` service account with no role bindings.
- `infra/prod/` is a skeleton with a GCS backend (`prefix = "prod"`) and zero
  resources, existing only to prove the backend connects. `infra/justfile` gets
  `init` / `plan` / `apply` / `output` recipes taking a layer name; `mise.toml`
  pins Terraform to an exact version.

## Container image build-and-push and Artifact Registry (2026-08-30)

- Added one Artifact Registry Docker repository, `siorie`, in `asia-northeast1`
  (managed by `infra/prod/`), with a KEEP-only cleanup policy (`keep_count = 2`,
  dry-run on — records retention intent, deletes nothing). Images are referenced
  as `asia-northeast1-docker.pkg.dev/siorie/siorie/app`.
- Added `infra/Dockerfile`: multi-stage, a `golang:1.27-bookworm` builder
  producing a `CGO_ENABLED=0` static binary, a
  `gcr.io/distroless/static-debian12:nonroot` final stage holding only that
  binary. The build context is the repo root and `-f infra/Dockerfile` is
  mandatory; a repo-root `.dockerignore` scopes it.
- `infra/justfile` gains `docker-auth` and `publish-image`: build from the repo
  root, push, tag with the 12-character short commit SHA, no `:latest`, no
  dirty-tree guard. Build and push from a workstation, not Cloud Build.

## Cloud Run service and dormant runtime SA (2026-08-30)

- Added to `infra/prod/`: a `google_cloud_run_v2_service` named `siorie`
  (`INGRESS_TRAFFIC_ALL`, `deletion_protection = false`, `min 0 / max 1`, one
  container from `app:${image_tag}` on port 8080, env `GOOGLE_CLIENT_ID` /
  `APP_ORIGIN` / `FIRESTORE_PROJECT_ID`); a public `roles/run.invoker` →
  `allUsers` binding (the Go API is the authorization boundary); a dormant
  `siorie-run` runtime service account with no role bindings.
- `image_tag` and `google_client_id` are default-less Terraform variables passed
  with `-var`; `outputs.tf` exposes `cloud_run_url`.
- `APP_ORIGIN` is built from the project number to keep this to a single apply.
  Scope was a minimal connectivity check (`curl <url>/api/hello` → 200 JSON);
  the operator applied it and the service is reachable at
  `https://siorie-u6y3wdsaua-an.a.run.app`.

## Development-only Dev Login path (2026-09-01)

- Added a development-only sign-in for browser end-to-end checks that can't
  complete a real Google sign-in. `AUTH_DEV_LOGIN=1` makes `cmd/server` log a
  startup warning, swap the real verifier for a `FakeVerifier` with fixed
  `dev-test-user` claims, and mount `POST /api/auth/dev-login`; anything else
  leaves the route absent (404) and the real flow untouched.
- The route is a plain chi route (not a Huma operation) so a JS-free top-level
  HTML `<form>` can submit it. It runs the same `Origin` check and
  session-issuing chain — extracted as the shared `establishSession` helper,
  also used by `POST /api/auth/google` — and redirects 302 to `/`.
- `LoginPage` renders a plain `<form method="post" action="/api/auth/dev-login">`
  "Dev Login" button, only under `import.meta.env.DEV`, so `vite build` strips
  it.

## Split infra/ into bootstrap / platform / app, add Firestore (2026-09-01)

- Re-cut `infra/` into three root modules by change frequency: `bootstrap/`
  (almost never; local committed state), `platform/` (rarely;
  `gs://siorie-tfstate/platform` — Artifact Registry, Firestore `(default)`, the
  `siorie-run` runtime SA, `roles/datastore.user`), and `app/` (every deploy;
  `gs://siorie-tfstate/app` — the Cloud Run service and its `allUsers` invoker).
  `infra/prod/` is retired; its four live resources move by `terraform import`,
  never destroy/recreate.
- Added the Firestore `(default)` database: `FIRESTORE_NATIVE`, single-region
  `asia-northeast1`, App Engine integration disabled, point-in-time recovery
  off, guarded by GCP-side `delete_protection_state` and Terraform
  `prevent_destroy`.
- `app` reads `platform` through GCP `data` sources, not
  `terraform_remote_state`, so a plan needs only ordinary project read access;
  when both layers change, `platform` is applied first. Per-deploy `-var`s
  (`image_tag`, `google_client_id`) stay only in `app`.

## Co-serve the SPA from the Go binary, use the real APP_ORIGIN (2026-09-03)

- `infra/Dockerfile` gains a `node:24-bookworm` web stage (corepack +
  `packageManager`-pinned pnpm, `pnpm install --frozen-lockfile`,
  `ARG VITE_GOOGLE_CLIENT_ID` inlined by `vite build`); the distroless final
  stage copies `apps/web/dist` to `/web`.
- The Go server serves the SPA, gated on `WEB_ROOT` (presence-triggered, `/web`
  in production, unset in local dev where Vite serves the frontend). It is the
  router's NotFound fallback: unmatched `/api/*` stays a plain 404; files under
  `/assets/` are served `immutable` and others `no-cache`; a missing
  `/assets/*` is 404, never index.html; any other unmatched GET/HEAD gets
  index.html for deep links.
- `APP_ORIGIN` becomes a third default-less `-var app_origin` holding the
  service's real URL, replacing the project-number-built value.
  `publish-image` now takes the OAuth client ID and passes it as the build arg.

## Manual production deploy from GitHub Actions via Workload Identity Federation (2026-09-05)

- Added `.github/workflows/deploy.yml`, dispatched by hand (`workflow_dispatch`)
  from `main` only. One job: `just check` as a gate, then
  `just infra/publish-image`, then `just infra/init app` and
  `just infra/apply app` — the same recipes an operator runs locally.
  `image_tag` is `git rev-parse --short=12 HEAD`, so the pushed and applied tags
  cannot diverge; `concurrency: deploy` queues, never cancels.
- Identity is GitHub OIDC → Workload Identity Federation → the `deployer`
  service account, no keys. The pool `github` / provider `github-actions` (in
  `infra/bootstrap/`) admits only `mitsuhitofujita/siorie` on `refs/heads/main`.
  `deployer`'s state-bucket bindings (the `app/` prefix, plus an unconditional
  `legacyBucketReader` so `terraform init` can list the bucket) live in
  `bootstrap`; its roles (`artifactregistry.writer`, `iam.serviceAccountUser` on
  the runtime SA, project `run.admin`) live in `platform`. `bootstrap` and
  `platform` stay human-only.
- Per-deploy inputs on the CI path come from GitHub Environment `production`
  secrets (`GOOGLE_CLIENT_ID`, `APP_ORIGIN`), branch policy `main` only. The
  workstation path remains for rollback; `infra/prod/` is removed for good.

## Delayed skeletons to stop the page-transition flicker (2026-09-07)

- On a fast API response the loading skeleton painted for only a few frames
  before the data landed, reading as a flicker right after a page transition.
- `useFetch` now derives a `showSkeleton` flag from a two-timer gate: nothing
  is shown for the first 150 ms of a load, then the skeleton appears and is
  held for at least 300 ms so it can't flash out; a slower load keeps it up
  until it resolves. Chose "blank then content" over an instant skeleton
  because a sub-150 ms blank beat is less noticeable than a skeleton that
  paints and is immediately replaced.
- Every `useFetch` page (`GroupsListPage`, `GroupDetailPage` group + item
  sections, `GroupEditPage`, `ItemDetailPage`, `ItemEditPage`) branches on
  `showSkeleton` first, then renders `null` while `status` is still `loading`
  in the pre-delay window.

## Remove all loading UI (2026-09-10)

- The white rounded blocks seen mid-load on the group- and item-detail pages
  were the skeletons themselves: the 150 ms delay added on 2026-09-07 only ever
  suppressed them for sub-150 ms responses, and the real API is slower than
  that, so the skeleton showed on nearly every navigation and then had to be
  held for its 300 ms minimum.
- Stripped the whole mechanism instead of retuning the timers: `useDelayedSkeleton`
  and `showSkeleton` are gone from `useFetch` (it now returns just
  `status`/`data`/`refetch`), the `Skeleton` component, its `.skeleton` CSS and
  the `skeleton-pulse` keyframes are deleted, and every page renders `null`
  while loading. `RootRoute` and `LoginPage` do the same while auth is loading.
- Chose "nothing until the data lands" as the simplest possible base to build
  on; the trade-off (a blank content area with no feedback on a slow or
  cold-start load) is accepted for now.

## One card per entry in the Groups and Items lists (2026-09-10)

- The groups list and a group's item list were a single `.card` box holding
  every row. Each row is now its own `.card` link, and `.list` stacks them with
  an 8 px (`--space-2`) gap.
- Dropped the `.row + .row` divider rule. It never matched, because every
  `.row` sits alone in its own `<li>`, and separate cards don't need it.
- Put `.card` on the `<Link>` itself rather than on the `<li>`, so the whole
  card is the tap target and the hover fill stays inside the rounded corners.

## One-terminal local dev (2026-11-03)

- `just dev` runs the Firestore emulator, API, and Vite dev server under
  `concurrently`, prefixing each line with `[firestore]`, `[api]`, or `[web]`.
  The API waits for port 8090 and Vite waits for `/api/hello`, so the stack
  starts in order and one Ctrl+C tears it down.
- `just dev-static` builds the SPA first, then serves it from the API at
  `http://localhost:8080` with `APP_ORIGIN`/`WEB_ROOT` overridden, for a
  production-like single-origin check.
- Chose `concurrently` (a Web devDependency) over separate terminals because
  the three processes are only useful together and the startup order was the
  part that was easy to get wrong.
