---
date: 2026-08-23
status: merged
discussions: [20260823-google-auth, 20260823-local-dev-same-origin]
decisions: [0002-google-id-token-auth]
pr: null
---

# Google authentication

## Scope

[20260823-google-auth](../../discussions/20260823-google-auth/discovery.md) is a bare discovery
note, not a proposal: "implement Google auth; put CLIENT_ID and CLIENT_SECRET in `.env`; JRE and
gcloud are installed and authenticated." There is no proposal for this topic, so the authoritative
spec is the already-accepted
[purpose-and-initial-tech-stack proposal](../../discussions/20260823-purpose-and-initial-tech-stack/proposal.md),
which fully specifies the auth flow (認証フロー), session design (セッション), Firestore data model,
and the three auth endpoints (`POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/me`).

This worklog implements only authentication: the three auth endpoints backed by Firestore
(`users/{sub}`, `sessions/{sha256(sessionId)}`), the `__Host-session` cookie, and real Google
Identity Services wiring on the frontend (replacing the `login()` stub from
[20260823-home-login-frontend-structure](../20260823-home-login-frontend-structure/README.md)).
It does not implement the groups/items backend endpoints — those stay out of scope.

The user does not yet have a real Google OAuth Web client ID at the start of this worklog; a real
one will be created in Cloud Console afterward. This worklog sets up `.env` with a **dummy**
`GOOGLE_CLIENT_ID` so the code path and local plumbing (Vite proxy, cookie flow, Firestore emulator)
can be verified end-to-end except for the actual "click the Google button and sign in" step, which
needs a real client ID registered with `http://localhost:5173` as an authorized JavaScript origin.

## Plan

- Backend (`apps/api`): add `cloud.google.com/go/firestore` and `google.golang.org/api` (idtoken)
  dependencies. Build `internal/googleauth` (ID token verification behind a `Verifier` interface,
  real impl + fake for tests) and `internal/store` (`UserStore`/`SessionStore` interfaces, a
  Firestore-backed impl integration-tested against the local emulator, and an in-memory fake for
  fast handler tests). Wire `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/me` into
  `internal/server` using Huma's `cookie:`/`header:` struct tags (no raw `http.ResponseWriter`
  access needed). Add a Firestore emulator recipe to `apps/api/justfile` for local dev.
- Frontend (`apps/web`): load the GIS script, initialize `google.accounts.id` with
  `import.meta.env.VITE_GOOGLE_CLIENT_ID`, and wire the existing "Google でログイン" button to
  `google.accounts.id.prompt()` instead of rendering Google's own button (keeps the existing
  custom-styled button). On credential response, `POST /api/auth/google` and refresh `/api/me`.
  Add a Vite dev-server proxy for `/api/*` so `pnpm dev` and the Go server share one browser-visible
  origin (required for the `__Host-session` cookie and `Origin` validation to work locally).
- `.env` handling: `apps/api/.env` (via `just`'s `dotenv-load`) for server-side vars, `apps/web/.env`
  for `VITE_GOOGLE_CLIENT_ID`. Add `.env.example` for both and gitignore the real files.

## What was built

### Backend (`apps/api`)

- Added `cloud.google.com/go/firestore@v1.25.0` and `google.golang.org/api@v0.293.0` (for
  `idtoken`).
- `internal/googleauth`: `Verifier` interface + `Claims{Sub,Email,Name,PictureURL}`.
  `GoogleVerifier.Verify` calls `idtoken.Validate` (checks signature, `aud`, `exp`) and additionally
  checks `iss` itself, since `idtoken.Validate` does **not** check the issuer — the proposal requires
  verifying `aud`, `iss`, and `exp`, so this would have been a silent gap otherwise.
  `FakeVerifier` (fixed `Claims`/`Err`) is a regular exported type, not a `_test.go` file, so
  `server` package tests can import it.
- `internal/store`: `UserStore` (`Upsert`, `Get`) and `SessionStore` (`Create`, `Lookup`, `Delete`,
  `DeleteExpiredForUser`) interfaces matching the proposal's data model exactly
  (`users/{sub}`, `sessions/{sha256(sessionId)}`, session docs holding only `userId`/`createdAt`/
  `expiresAt`). `FirestoreStore` implements both against a real `*firestore.Client` (the client
  auto-detects the local emulator via `FIRESTORE_EMULATOR_HOST`, no code branching needed).
  `DeleteExpiredForUser` filters by the single equality field `userId` (auto-indexed) and checks
  expiry client-side, deliberately avoiding a composite index — the proposal explicitly defers
  "Firestore のインデックス" to a later topic. `MemoryStore` is an in-memory double implementing both
  interfaces, used by `server` package handler tests.
- `internal/server/auth.go`: `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/me`,
  registered via `huma.Register` using Huma's `cookie:"__Host-session"` input tag and
  `header:"Set-Cookie"` / `header:"Origin"` tags — no raw `http.ResponseWriter` access needed for
  cookies. State-changing endpoints check `Origin` against `Deps.AppOrigin` inline
  (`validateOrigin`), matching the proposal's CSRF defense (same-origin deploy + `SameSite=Lax` +
  Origin check + JSON-only bodies). `server.NewRouter` now takes a `Deps` struct
  (`Verifier`/`Users`/`Sessions`/`AppOrigin`) instead of no arguments.
- `cmd/server/main.go`: reads `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `FIRESTORE_PROJECT_ID` (all
  required, `log.Fatalf` if unset), builds a real `firestore.Client` and `GoogleVerifier`, wires them
  into `server.NewRouter`.
- `apps/api/justfile`: `set dotenv-load` (reads `apps/api/.env`); new `firestore-emulator` recipe
  for long-running local dev use (port 8090); `test` recipe now starts its own throwaway emulator
  (port 8091, separate from the dev one) for the duration of `go test ./...` so Firestore
  integration tests aren't skipped under `just check`.
- Tests: `internal/server/auth_test.go` covers login→me→logout with the fake verifier + memory
  store (cookie attributes, wrong-Origin 403, invalid-token 401, session invalidation after
  logout). `internal/store/firestore_test.go` integration-tests `FirestoreStore` against the real
  emulator (skipped via `t.Skip` if `FIRESTORE_EMULATOR_HOST` is unset, so a bare `go test ./...`
  still works without the emulator running).

### Frontend (`apps/web`)

- `src/lib/auth.tsx`: loads `https://accounts.google.com/gsi/client` once (guarded against double
  injection, e.g. React StrictMode), calls `google.accounts.id.initialize({ client_id, callback })`
  with `import.meta.env.VITE_GOOGLE_CLIENT_ID`. `AuthContextValue.renderSignInButton(container)`
  calls `google.accounts.id.renderButton(container, {...})` (Google's own button, `locale: 'ja'`,
  `theme: 'filled_black'`) once GIS has initialized. The credential callback `POST`s to
  `/api/auth/google`, then re-checks `/api/me` to update `AuthState`. `logout()` unchanged in
  behavior, still `POST /api/auth/logout`.
  **This replaced an initial `login()` that called `google.accounts.id.prompt()` (One Tap) from the
  existing custom-styled button's `onClick` — see Difficulties below for why that didn't work.**
- `src/pages/HomePage.tsx`: the unauthenticated branch now renders an empty
  `<div ref={signInButtonRef} data-testid="google-signin-button" />` that
  `renderSignInButton` mounts Google's button into, instead of a `Button` wired to a click handler.
- `src/lib/google-identity.d.ts`: hand-written ambient types for the small slice of the GIS API
  used here (same approach as the hand-written shadcn/ui primitives already in this repo);
  `renderButton`'s option shape, not `prompt`.
- `src/vite-env.d.ts`: added, augmenting `ImportMetaEnv` with `VITE_GOOGLE_CLIENT_ID: string`.
- `vite.config.ts`: added `server.proxy['/api'] -> http://localhost:8080` so `pnpm dev` and the Go
  server present as one origin to the browser — required for the `__Host-session` cookie and the
  `Origin` check to behave like the single-origin Cloud Run deployment.
- `src/lib/auth.test.tsx`: mocks `window.google` and `fetch` to cover the loading→
  unauthenticated/authenticated transitions, `initialize()` receiving the configured client ID,
  `renderSignInButton()` calling `google.accounts.id.renderButton` with the given container once
  GIS is ready, the credential callback's POST→refresh sequence, and logout.
- `src/test/setup.ts`: added a global `afterEach(cleanup)` — see Difficulties below.

### `.env` / gitignore

- `apps/api/.env.example` and `apps/web/.env.example` added (tracked). `apps/api/.env` and
  `apps/web/.env` created with **dummy** values (`dummy-client-id.apps.googleusercontent.com`, a
  placeholder secret and project id) at the user's request, and added to `.gitignore`. The user will
  overwrite these with real values once they create the OAuth client.

## Verification

- `just apps/api/check` (format-check, lint, `go vet`, tests incl. the emulator-backed integration
  tests, build) passes.
- `pnpm lint`, `pnpm exec tsc -b --noEmit`, `pnpm format:check`, `pnpm test` (20 tests), `pnpm build`
  all pass.
- Manually ran the real stack end-to-end: Firestore emulator + `just apps/api/dev` + `pnpm dev`,
  then `curl` against `/api/hello`, `/api/me` (401 without a cookie), `/api/auth/google` (403 on
  wrong `Origin`, 401 on the dummy/invalid token — real Google signature verification correctly
  rejects it), and confirmed the Vite proxy forwards `/api/*` to the Go server so the browser only
  ever sees `http://localhost:5173`. Opened the home page in Chrome: unauthenticated view renders,
  the GIS script (`gsi/client`, `gsi/style`) loads with real 200s, `initialize()` runs with no
  console errors. Clicking "Google でログイン" calls `prompt()` but — as expected with a dummy
  client ID — Google's client-side validation silently declines to show the One Tap UI (no network
  request, no console error either); this is the one part of the flow that needs the user's real
  `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` to verify further.
- **Update after the user filled in real `.env` values**: `apps/api/.env` and `apps/web/.env` now
  carry the same real `...apps.googleusercontent.com` client ID (verified they match). Re-ran the
  same manual check in Chrome, signed into `mitsuhitofujita@gmail.com` in that browser profile.
  Clicking "Google でログイン" now fails with a concrete, reproducible console error:
  `[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token.` This is a Google
  Identity Services / FedCM-side rejection, not a bug in this app's code — it happens before any
  request our own code makes. The most likely cause is that `http://localhost:5173` has not yet been
  added to the OAuth client's **Authorized JavaScript origins** in Cloud Console (the tech-stack
  proposal calls for registering both the prod `run.app` URL and the local dev URL there), or that
  the OAuth consent screen isn't fully published yet. This needs to be checked/fixed in Cloud Console
  by the user; once done, retry the same click to confirm sign-in actually completes end to end.
- **Root cause found and fixed: `login()` called `google.accounts.id.prompt()` (One Tap), which was
  the wrong API for a button-click-triggered sign-in.** After the user confirmed Authorized
  JavaScript origins were correctly configured (both `http://localhost:5173` and, per their own
  experience with another app, the bare `http://localhost`) and the FedCM error still reproduced,
  the user pointed out that clicking a sign-in button should visibly navigate somewhere — Google's
  approval screen, a popup, anything — regardless of whether the origin config was right. That was
  the right question: One Tap's `prompt()` is meant to display automatically on page load, not be
  triggered by a click, and has no fallback to a popup/redirect flow if a FedCM-based sign-in fails —
  so a button wired to it can fail completely silently, which is exactly what was observed
  throughout this whole investigation. Switched `login()` → `renderSignInButton(container)`, which
  calls `google.accounts.id.renderButton()` (Google's own "Sign in with Google" button, which does
  have a popup fallback) instead. This changes what's on screen — the custom-styled "Google でログイン"
  button is now Google's own rendered button — but is the actually-supported pattern for
  explicit, user-initiated sign-in.
- **Confirmed working**: the user tested the rendered Google button in their own browser (against
  the real Firestore emulator, the real Go server, and their real `GOOGLE_CLIENT_ID`) and the full
  sign-in flow completes successfully. The Google-auth implementation is functionally done.

## Difficulties

- **The biggest difficulty was chasing Google Cloud Console configuration for too long when the
  actual bug was on this side (misusing `prompt()`).** With the dummy client ID, "clicking does
  nothing" was chalked up to the dummy value being invalid, which seemed reasonable. Once the user
  swapped in a real client ID, clicking still did nothing, and the console showed only
  `FedCM get() rejects with NetworkError: Error retrieving a token.` I latched onto "the Authorized
  JavaScript origins must be missing" and asked the user to re-check Cloud Console multiple times.
  Only when the user said "I've already checked that — and even if it were wrong, clicking the
  button should still navigate somewhere, like Google's approval screen" did I realize I'd been
  asking the wrong question from the start. `google.accounts.id.prompt()` (One Tap) is meant to
  display automatically on page load, not be triggered by a click, and — unlike Google's rendered
  button — has no fallback to a popup/redirect flow if a FedCM-based sign-in fails. So the button
  would fail with zero visible feedback whether or not the Console config was correct. Fixed by
  switching to `renderSignInButton`, which calls `google.accounts.id.renderButton()` (Google's own
  button, which does have a fallback). Before doubting the Console configuration, I should have
  first questioned whether the API being called was even the right one for a click-triggered flow.
- **`GOOGLE_CLIENT_SECRET` went into `.env` but is never read by any code.** The discovery note said
  to put both `CLIENT_ID` and `CLIENT_SECRET` in `.env`, but the tech-stack proposal explicitly
  states that this app's OAuth client secret must not be placed in the browser or the container —
  the ID Token flow doesn't need one at all. Whoever wrote the discovery note was probably thinking
  of a traditional authorization-code flow. Silently dropping the value didn't feel right either, so
  `apps/api/.env.example` documents `GOOGLE_CLIENT_SECRET` as present-but-unread. If some future flow
  (e.g. a server-side token exchange) needs it, that should be a deliberate decision made then.
- **`idtoken.Validate` does not check `iss`.** The proposal calls for verifying `aud`, `iss`, and
  `exp`, but Google's own Go client library only checks the signature, `aud`, and `exp` — issuer
  verification is left to the caller. This wasn't obvious from the godoc; I only found it by reading
  the library's source. Added an explicit check in `GoogleVerifier.Verify` for
  `accounts.google.com` / `https://accounts.google.com`.
- **Local dev needing a Vite proxy was never mentioned anywhere in the proposal.** The proposal's
  request flow assumes the production setup where the SPA and API are served from one Cloud Run
  service. Locally, Vite (5173) and the Go server (8080) are different origins by default, which
  would break the `__Host-session` cookie and the `Origin` check as seen by the browser. Added
  `server.proxy` in `vite.config.ts` so the browser only ever sees `localhost:5173`. The fact that
  `APP_ORIGIN` in the local `.env` also needs to be Vite's origin rather than the Go server's own
  port wasn't something I noticed until I actually ran the stack. Since the same kind of problem
  seems likely to resurface for a future staging environment or a different deployment topology,
  wrote it up as a new discovery,
  [20260823-local-dev-same-origin](../../discussions/20260823-local-dev-same-origin/discovery.md).
- **Firestore rounds timestamps to microsecond precision.** `FirestoreStore.Upsert`/`Create`
  originally used `time.Now().UTC()` (nanosecond precision) directly for the returned value as well
  as what got persisted. A value read back from Firestore is rounded to microseconds, so the value
  returned right after a write didn't match what a later read would return. Caught this when an
  integration test asserting `CreatedAt` stays unchanged across two `Upsert` calls failed by a few
  hundred nanoseconds against the real emulator. Fixed by rounding to `time.Microsecond` at the point
  of use. The in-memory fake store alone would never surface this kind of rounding, so it would have
  gone unnoticed without an emulator-backed integration test.
- **`@testing-library/react`'s auto-cleanup had actually never been running in this project at all.**
  This repo doesn't enable `test.globals` in `vite.config.ts`, and each test file imports `afterEach`
  etc. explicitly from `'vitest'`. RTL's auto-cleanup only registers itself by detecting a global
  `afterEach`, so in this setup it silently never ran. Existing tests happened to use queries that
  never collided with a previous, un-cleaned-up render (e.g. `getByRole` names that differ per
  state), so this had never surfaced before. The new `auth.test.tsx` used the same
  `data-testid="status"` on every render, which immediately produced a "found multiple elements"
  error starting with the second test in the file. Fixed by adding `afterEach(cleanup)` to the shared
  `src/test/setup.ts`, which benefits every test file, not just the new one — this was a latent gap
  that predated this worklog.
- **Huma defaults to `204 No Content` when the output struct has no `Body` field.**
  `PostAuthLogoutOutput` only has a `SetCookie` header field, so it responds `204` instead of `200`
  (confirmed the `Set-Cookie` header is still written correctly on that 204). Harmless, but a test
  expecting `200` failed once because of it. Worth remembering: `POST /api/auth/logout` returns
  `204`, not `200`.
- **The behavior of calling `google.accounts.id.prompt()` with a dummy client ID couldn't be verified
  without actually trying it.** As expected, GIS validated the client ID on the spot and declined to
  show the One Tap UI at all (not even a network request), with no console error either. Since
  nothing visibly happens either way, there was no way to tell from just reading the code whether a
  dummy ID would be rejected outright or fail for some other reason until it was actually clicked in
  Chrome. (In hindsight, this silent-failure behavior was the same symptom that the real root cause —
  `prompt()` having no fallback — produced later with a real client ID too.)
