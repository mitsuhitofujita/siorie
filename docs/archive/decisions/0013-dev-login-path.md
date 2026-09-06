# 0013: Development-only Dev Login path

Discussion: [Local E2E test login](../discussions/0013-local-e2e-test-login/proposal.md)
Worklog: [Development-only Dev Login path](../worklogs/0014-dev-login-path/plan.md)

## Status

Accepted. Adds a development-only sign-in path beside
[decision 0002](0002-google-id-token-auth.md)'s Google ID Token flow without
changing it. Keeping the enable flag out of the production Cloud Run `env` is a
config check deferred to
[discussion 0003](../discussions/0003-cicd-service-selection/proposal.md) (CI/CD),
still open.

## Decision

- **`AUTH_DEV_LOGIN=1` on the API server enables a dev-only sign-in; anything
  else disables it.** When off, the route below does not exist (404) and the
  real Google verifier is untouched. When on, `cmd/server` logs a startup
  `WARNING` and:
  - swaps the `Verifier` for a `googleauth.FakeVerifier` returning fixed claims —
    `Sub: "dev-test-user"`, `Email: "dev-test-user@example.com"`,
    `Name: "Dev Test User"`;
  - mounts `POST /api/auth/dev-login`.

- **`POST /api/auth/dev-login` is a plain chi route, not a Huma operation**, so a
  JS-free top-level HTML `<form>` navigation can submit it — `/api/auth/google`
  only accepts a JSON body. It runs the same Origin check and the same
  session-issuing chain as the real route (`Verify → user upsert →
  expired-session cleanup → session create → __Host-session cookie`), extracted
  as the shared `establishSession` helper. The credential passed is the empty
  string, which the fake verifier ignores. Success is a `302` to `/`, not a JSON
  body.

- **The real `POST /api/auth/google` keeps its 401-vs-500 split but loses its
  three distinct 500 bodies.** Sharing `establishSession` means every storage
  failure now returns one `"failed to sign in"` 500; a rejected credential is
  still `401`, routed by an `errInvalidCredential` sentinel. The old per-step
  strings were internal detail and no test asserted them.

- **The enable signal is `server.Deps.DevLogin bool`, set by `cmd/server`.**
  `internal/server` does not read the environment. `DevLogin: true` is only
  meaningful with a fake verifier; that pairing lives in `main.go`, not the type
  system.

- **Frontend: a "Dev Login" button on `LoginPage`, gated on
  `import.meta.env.DEV`.** It is a plain `<form method="post"
  action="/api/auth/dev-login">` — no JS, no new frontend env var. `vite build`
  strips it; `vite dev` (and Vitest) include it. The frontend gate and
  `AUTH_DEV_LOGIN` are deliberately unlinked: the only odd combination (backend
  on, button hidden) still leaves the route Origin-guarded.

- **One fixed user, one session shape. No arbitrary-user or multi-session
  support.** The intended consumer is Claude Code's browser automation for
  end-to-end checks, not human manual QA.

## Rationale

Auth-gated features had been shipping without a real browser click-through:
worklogs 0004 and 0005 both stopped at the same wall — no Google account in the
dev environment, and `document.cookie` injection blocked by the browser tool.
Swapping only the verifier and reusing `establishSession` keeps session creation
and the Origin check on the real code path, which is exactly what an E2E check
needs to exercise; a full bypass endpoint would prove nothing. A separate plain
route rather than the same URL is forced by Huma's JSON-only body on
`/api/auth/google` versus a top-level form navigation. Off by default, plus the
route being absent when disabled, plus no button in production bundles, keeps the
bypass out of production by construction — the one residual risk (the env var set
in prod) is a deploy-config check that belongs with CI/CD, and the startup
`WARNING` makes an accidental enable loud.
