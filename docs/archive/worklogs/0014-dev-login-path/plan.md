---
date: 2026-09-01
status: merged
discussions: [0013-local-e2e-test-login]
decisions: [0013-dev-login-path]
pr: null
---

# Development-only Dev Login path

Implements [discussion 0013](../../discussions/0013-local-e2e-test-login/proposal.md):
a development-only sign-in path so a browser-driven E2E check can reach the
authenticated UI without a real Google account (the gap hit in worklogs 0004 and
0005, where the last "click the button and watch it work" step was skipped every
time an auth-gated feature landed).

## Plan

1. `apps/api/internal/server/auth.go` — extract the sign-in chain
   (`Verify → Upsert → DeleteExpiredForUser → Create → build cookie`) shared by
   the real route and the dev route into `establishSession`, and add
   `devLoginHandler` (plain `http.HandlerFunc`: Origin check → `establishSession`
   with an empty credential → `Set-Cookie` → 302 to `/`).
2. `apps/api/internal/server/server.go` — `Deps.DevLogin bool`; when set, mount
   `POST /api/auth/dev-login` as a plain chi route alongside the Huma routes.
3. `apps/api/cmd/server/main.go` — read `AUTH_DEV_LOGIN`; when `"1"`, log a
   warning, swap `GoogleVerifier` for a `FakeVerifier` with fixed claims, and set
   `Deps.DevLogin`.
4. `apps/api/.env.example` — document `AUTH_DEV_LOGIN`.
5. `apps/web/src/pages/LoginPage.tsx` — a plain `<form method="POST"
   action="/api/auth/dev-login">` shown only when `import.meta.env.DEV`.
6. Tests: Go handler tests for the dev route (302 + cookie + user created, wrong
   Origin → 403, route absent when `DevLogin` is false); a `LoginPage` test that
   the form renders.
7. `docs/discussions/0013-local-e2e-test-login/discovery.md` frontmatter —
   `status: proposed → worked`, add `0014-dev-login-path` to `worklogs`.

## Preflight (checked before starting)

| Check | State |
| --- | --- |
| `FakeVerifier` exists | yes — `apps/api/internal/googleauth/fake.go`, `Verify` returns `v.Claims` verbatim, ignores the token |
| real route's sign-in chain | `apps/api/internal/server/auth.go` `post-auth-google` handler, inline: `validateOrigin` → `verifier.Verify` → `users.Upsert` → `sessions.DeleteExpiredForUser` → `sessions.Create` → `newSessionCookie` |
| router type | `NewRouter` builds `router := chi.NewMux()`, wraps it with `humachi.New`; the `chi.Mux` is in scope for a plain `router.Post(...)` before `return router` |
| `import.meta.env.DEV` | Vite build-time flag, `true` under `vite dev`, `false` in `vite build`; also `true` under Vitest, so a test can assert the form renders |
| local `.env` files present | not checkable — `apps/api/.env` / `apps/web/.env` are git-ignored; `.env.example` is the tracked reference |
| chi `v5.3.2` / huma `v2.39.1` | plain routes and Huma routes coexist on one mux; `/api/auth/dev-login` is not a path any Huma route claims |

## Progress

### Files written

- `apps/api/internal/server/auth.go`:
  - `errInvalidCredential` sentinel + `establishSession(ctx, deps authDeps,
    credential string) (*http.Cookie, *store.User, error)` — the full chain
    `Verify → Upsert → DeleteExpiredForUser → Create → newSessionCookie`, lifted
    verbatim out of the `post-auth-google` handler. A verify failure is wrapped
    as `errInvalidCredential`; storage failures are wrapped plainly.
  - `post-auth-google` handler body now: `validateOrigin` → `establishSession` →
    `errors.Is(err, errInvalidCredential)` ? 401 : 500 on error, else set cookie
    + body. ~14 lines shorter.
  - `devLoginHandler(deps authDeps) http.HandlerFunc` — `validateOrigin` on the
    raw `Origin` header → `establishSession(r.Context(), deps, "")` → `http.Error`
    403/500 on failure → `http.SetCookie` + `http.Redirect(w, r, "/", 302)`.
- `apps/api/internal/server/server.go` — `Deps.DevLogin bool`; `NewRouter` builds
  the `authDeps` once as `aDeps`, and when `deps.DevLogin` calls
  `router.Post("/api/auth/dev-login", devLoginHandler(aDeps))` on the chi mux
  (before the Huma group/item/hello registrations; order does not matter).
- `apps/api/cmd/server/main.go` — `var verifier googleauth.Verifier =
  &googleauth.GoogleVerifier{...}`; `devLogin := os.Getenv("AUTH_DEV_LOGIN") ==
  "1"`; when set, `log.Printf("WARNING: ...")` and reassign `verifier` to a
  `FakeVerifier` with fixed claims (`Sub: "dev-test-user"`, `Email:
  "dev-test-user@example.com"`, `Name: "Dev Test User"`). `Deps` gets
  `Verifier: verifier, DevLogin: devLogin`.
- `apps/api/.env.example` — `AUTH_DEV_LOGIN=` with a comment block (empty =
  disabled; never set in production).
- `apps/web/src/pages/LoginPage.tsx` — after the `.signin` div, wrapped in
  `{import.meta.env.DEV && ( … )}`: a `<form className="signin" method="post"
  action="/api/auth/dev-login">` with `<button type="submit" className="btn
  btn-outline btn-sm">Dev Login</button>` and a `.caption` note.
- `apps/api/internal/server/auth_test.go` — `newDevLoginRouter` helper (Deps with
  `DevLogin: true` and a fixed-claims `FakeVerifier`) +
  `TestPostAuthDevLogin_CreatesSessionAndRedirects` (302 → `/`, cookie
  attributes, follow-up `GET /api/me` → "Dev Test User"),
  `TestPostAuthDevLogin_RejectsWrongOrigin` (403),
  `TestPostAuthDevLogin_AbsentWithoutDevLogin` (404 on the default router).
- `apps/web/src/pages/LoginPage.test.tsx` — a test that the dev-login form
  renders with `action="/api/auth/dev-login"` and `method="post"`.
- `docs/discussions/0013-local-e2e-test-login/discovery.md` — frontmatter
  `status: proposed → worked`, `worklogs: [0005-items-crud, 0014-dev-login-path]`.

### Checks run

- `gofmt -l apps/api` — clean. `go build ./...`, `go vet ./...` — clean.
- `go test ./internal/server/...` — pass (includes the three new dev-login
  tests). Full `just check` — exit 0 (Go format-check / vet / test-with-emulator
  / build; web format-check / lint / test 53 passed / build; `terraform fmt
  -check`). The one ESLint warning is pre-existing in `src/lib/use-fetch.ts`,
  untouched here.
- Live stack (`just apps/api/firestore-emulator`, `AUTH_DEV_LOGIN=1 just
  apps/api/dev`, `just dev-web`):
  - `curl -i -X POST localhost:8080/api/auth/dev-login -H 'Origin:
    http://localhost:5173'` → `302`, `Location: /`, `Set-Cookie:
    __Host-session=…; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`.
  - `GET /api/me` with that cookie → `200 {"name":"Dev Test User",
    "pictureUrl":""}`.
  - Wrong `Origin` → `403`.
  - **Browser tool** (the proposal's stated premise): opened `localhost:5173` →
    redirected to `/login` → the "Dev Login" button rendered → clicked it →
    landed on `/groups` **authenticated** (header avatar, empty-state). No
    `[BLOCKED: Cookie/query string data]`, no console errors. Then created a
    group ("Dev E2E smoke test") through the UI: `POST /api/groups`
    (Origin-checked, state-changing) succeeded and the list re-rendered with the
    new row. This is the exact "click a button, watch a write land" step that
    worklogs 0004 and 0005 could never reach.

## What was done

All seven plan steps landed as written. The backend shares one `establishSession`
helper between `POST /api/auth/google` (Huma, JSON) and the new
`POST /api/auth/dev-login` (plain chi, form-submittable), the latter mounted only
when `Deps.DevLogin` is set. `cmd/server` turns `AUTH_DEV_LOGIN=1` into both the
`FakeVerifier` swap and `DevLogin: true`, and logs a startup warning. The login
page grows a JS-free `<form>` that Vite includes only in `vite dev`. Automated
tests cover the new route (success/redirect/cookie, wrong Origin, absent by
default) and the form's presence. The live browser click-through — the whole
reason this discussion exists — works, including a follow-on state-changing write.

Agent side: complete. No operator step is outstanding for this worklog. The
`/decide` record and any `design/` update are the normal follow-ups.

## Difficulties

Nothing broke. The three things worth recording are all small deltas from the
proposal's letter, plus one confirmation that matters.

### The proposal's central premise held — the browser guard is not tripped

The proposal was explicit that this had to be checked "worklog での実装直後に必ず
検証する": that clicking the Dev Login button via the browser automation tool would
**not** hit the `[BLOCKED: Cookie/query string data]` guard that blocked
`document.cookie` injection in worklogs 0004 and 0005. It does not. The flow is a
top-level `<form>` POST → `302` → top-level GET of `/`; the session cookie rides
the redirect (`SameSite=Lax` permits it on a top-level navigation), and no
JavaScript ever reads or writes `document.cookie` or a query string. The browser
tool saw only ordinary navigations. A follow-up `POST /api/groups` from the
authenticated SPA also went through, so the Origin check — the part the proposal
most wanted to exercise for real — passes end to end. This is the "went well"
part, but it is the point of the whole exercise, so it is recorded in full.

### The three granular 500 messages on `/api/auth/google` collapsed into one

The old handler returned distinct bodies for the three storage failure points
("failed to save user" / "failed to clean up sessions" / "failed to create
session"). `establishSession` returns a single wrapped error, so the handler now
returns one `"failed to sign in"` 500. The **meaningful** split — verify failure
→ 401, anything else → 500 — is preserved via the `errInvalidCredential`
sentinel. No test asserted the old strings, and they were arguably internal
detail leaking to the client, so this was taken as an acceptable simplification
rather than worked around. Flagging it only so a future reader does not think
the granularity was lost by accident.

### `AUTH_DEV_LOGIN` is wired through a bool, not read inside `internal/server`

The proposal said the dev route is "`AUTH_DEV_LOGIN=1` のときだけ登録". Implemented
as `Deps.DevLogin bool` set by `cmd/server`, not as `internal/server` reading the
env var — so `internal/server` stays free of environment lookups (every other
env read is in `main.go`) and the tests set the flag directly. Same behaviour,
cleaner seam. Not a deviation in intent.

### Latent: `DevLogin: true` only makes sense paired with a `FakeVerifier`

`devLoginHandler` calls `establishSession(ctx, deps, "")` — an empty credential.
That is fine only because `cmd/server` always swaps in a `FakeVerifier` (which
ignores the token) whenever it sets `DevLogin: true`. A hand-built
`Deps{DevLogin: true, Verifier: &GoogleVerifier{}}` would compile and then 500 on
every dev-login call. The pairing lives in `main.go` and is not enforced by the
type system. Acceptable for a dev-only path; noted in case the two ever drift.

## Review — for the operator

One item is a standing risk the proposal already named, but it now has a concrete
address it did not have when the proposal was written. Everything else here is a
clean, one-off implementation detail and needs no `discovery.md`.

### `AUTH_DEV_LOGIN` and the production surface

The proposal's "リスクと対応" already flagged: if `AUTH_DEV_LOGIN=1` is ever set in
production, anyone can sign in as `dev-test-user`, and the mitigation ("confirm
it is not in the deploy config") was deferred to the CI/CD discussion
([0003](../../discussions/0003-cicd-service-selection/proposal.md), still
`proposed`). Since the proposal was written, worklog
[0013-cloud-run-service](../0013-cloud-run-service/plan.md) landed a real Cloud
Run service in `infra/prod/main.tf` with an explicit `env` list. That list does
**not** include `AUTH_DEV_LOGIN`, so production is safe today by omission — but
nothing documents that the omission is deliberate, and nothing fails if a future
edit adds it. The deferred risk now has a specific home (the Cloud Run `env`
block and whatever CI passes to it).

Operator's call (2026-09-01): **keep this folded into discussion 0003**, no
separate `discovery.md`. When 0003 (CI/CD service selection) is picked up, the
"`AUTH_DEV_LOGIN` must not reach the prod Cloud Run `env`" check rides along with
it; until then, this Review note is the only record.

### The `import.meta.env.DEV` / `AUTH_DEV_LOGIN` non-linkage

The proposal already called this out as a known, harmless mismatch (frontend
button visibility and backend route existence are controlled by two unrelated
flags). The live check bore out the harmless direction: with both enabled it
just works. The only "bad" combination is backend-on / frontend-off, which just
hides the button — the route still exists and is still Origin-guarded. Recorded
as expected, not a new finding.
