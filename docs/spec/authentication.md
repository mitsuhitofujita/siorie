# Authentication

Sign-in is Google only, using the Google Identity Services **ID Token** flow.
The API verifies the token and issues its own opaque, server-side session; the
browser never holds anything but a session cookie. There is no OAuth client
secret anywhere in the system.

## Sign-in flow

1. The SPA loads the GIS script and initializes `google.accounts.id` with
   `VITE_GOOGLE_CLIENT_ID`. `LoginPage` mounts `GoogleSignInButton`, which
   renders Google's own "Sign in with Google" button into a container it fully
   owns.
2. On success GIS invokes the credential callback with an ID Token. `AuthProvider`
   `POST`s it to `POST /api/auth/google` as `{ "credential": "<token>" }`.
3. The API verifies the token (`GoogleVerifier`): signature, `aud`, and `exp`
   via `google.golang.org/api/idtoken`, plus an explicit `iss` check against
   `accounts.google.com` / `https://accounts.google.com`. It reads `sub`,
   `email`, `name`, `picture`.
4. The API runs the shared `establishSession` chain: upsert `users/{sub}`, delete
   that user's already-expired sessions, create a new session, build the cookie.
   It responds `200` with `{ name, pictureUrl }` and a `Set-Cookie` header.
5. `AuthProvider` re-fetches `GET /api/me`, the auth state flips to
   `authenticated`, `<RequireGuest>` navigates away from `/login`, and
   `LoginPage` unmounts (removing the button's `<div>` and Google's injected
   `<iframe>` with it).

Google's rendered button is used rather than a custom control wired to
`google.accounts.id.prompt()` (One Tap): `prompt()` is meant to display
automatically on load, not on a click, and has no popup fallback when a
FedCM-based sign-in can't complete, so it can fail with no visible feedback.

## Session & cookie

- A session ID is 32 cryptographically random bytes, base64url-encoded. It is
  handed to the browser in a `__Host-session` cookie: `Path=/`, `Secure`,
  `HttpOnly`, `SameSite=Lax`, `Max-Age` = 30 days.
- Firestore stores only `sessions/{sha256(rawSessionId)}` holding `userId`,
  `createdAt`, `expiresAt` — never the raw ID. A leaked database cannot be
  turned into a valid cookie.
- On lookup, an expired session is deleted and treated as absent. At sign-in the
  user's other already-expired sessions are swept (`DeleteExpiredForUser`, a
  single `userId ==` query, no composite index).

## Session use

`authenticateSession` resolves the `__Host-session` cookie to a user ID for every
group and item handler and for `GET /api/me`. A missing, unknown, or expired
session yields `401`. The resolved user ID scopes every Firestore path; it is
never read from a request parameter, so one user cannot address another user's
groups or items.

## Logout

`POST /api/auth/logout` validates `Origin`, deletes the session named by the
cookie (a no-op if absent), and returns a cleared `__Host-session` cookie (it
carries no response body, so the status is `204`). The SPA resets its auth state
regardless of the response.

## CSRF defense

State-changing requests (`POST /api/auth/google`, `POST /api/auth/logout`, and
every group/item `POST`/`PATCH`/`DELETE`) call `validateOrigin`: the `Origin`
header must be present and exactly equal to the server's `APP_ORIGIN`, else
`403`. This layers on top of:

- the same-origin deployment (SPA and API on one Cloud Run origin in production;
  the Vite proxy reproduces a single origin locally), and
- the `SameSite=Lax` session cookie.

For this to work locally, `APP_ORIGIN` must be set to the Vite dev origin
(`http://localhost:5173`), not the Go server's own port. In production it is
the deterministic Cloud Run URL. The service's other default URL (the legacy
`*.a.run.app` hash form) only redirects SPA GET/HEAD requests to the canonical
origin; a state-changing API request arriving there still fails `validateOrigin`
with `403`.

## Client-side route protection

`<RequireAuth>` redirects a settled-`unauthenticated` visitor to `/login` before
any `/groups` request is made; `<RequireGuest>` redirects a
settled-`authenticated` visitor away from `/login`. This is a UX guard only —
the API still enforces auth on every request. A session that expires mid-use
(the client still believes it is authenticated) surfaces as a `401` handled by
the page's error state.

## Development-only Dev Login

For browser end-to-end checks that cannot complete a real Google sign-in:

- Setting `AUTH_DEV_LOGIN=1` on the API makes `cmd/server` log a startup
  `WARNING`, replace `GoogleVerifier` with a `FakeVerifier` returning fixed
  claims (`sub` `dev-test-user`, `dev-test-user@example.com`, "Dev Test User"),
  and set `Deps.DevLogin` so `POST /api/auth/dev-login` is mounted. Any other
  value leaves the route absent (`404`) and the real verifier in place.
- `POST /api/auth/dev-login` is a plain chi route (not a Huma operation), so a
  JS-free top-level HTML `<form>` navigation can submit it —
  `POST /api/auth/google` only accepts a JSON body. It runs the same
  `validateOrigin` check and the same `establishSession` chain (the fake
  verifier ignores the empty credential) and responds `302` to `/`, so the
  session cookie rides the redirect.
- `LoginPage` renders a plain `<form method="post" action="/api/auth/dev-login">`
  "Dev Login" button, gated on `import.meta.env.DEV`, so `vite build` strips it.
  The frontend gate and the backend `AUTH_DEV_LOGIN` flag are independent; the
  production Cloud Run env does not set `AUTH_DEV_LOGIN`.
