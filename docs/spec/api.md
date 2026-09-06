# API (`apps/api`)

A single Go module. chi is the router; [Huma](https://huma.rocks) wraps it to
give typed, OpenAPI-reflectable handlers. The binary serves the JSON API and, in
production, the built SPA from the same process.

## Process (`cmd/server`)

`main.go` reads configuration from the environment:

- `PORT` — listen port, default `8080` (Cloud Run injects it).
- `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `FIRESTORE_PROJECT_ID` — all **required**;
  the server calls `log.Fatalf` if any is unset.
- `WEB_ROOT` — optional, presence-triggered. When set, the SPA is co-served from
  that directory (production: `/web`). Unset in local dev.
- `AUTH_DEV_LOGIN` — optional. `=1` enables the development-only Dev Login path
  (see `authentication.md`); the server logs a startup `WARNING` and swaps in a
  fake token verifier.

It builds one `firestore.Client` for the project, wraps it in a
`store.FirestoreStore`, passes everything to `server.NewRouter` as a `Deps`
struct, and runs an `http.Server` with graceful shutdown (5 s) on
`SIGINT`/`SIGTERM`.

## Router (`internal/server`)

`NewRouter(Deps)` builds a `chi` mux, attaches a Huma adapter, and registers:

| Method & path | Purpose |
| --- | --- |
| `GET /api/hello` | Fixed JSON greeting. |
| `POST /api/auth/google` | Sign in with a Google ID Token; sets the session cookie. |
| `POST /api/auth/logout` | Delete the current session; clears the cookie. |
| `GET /api/me` | Return the signed-in user (`name`, `pictureUrl`) or 401. |
| `POST /api/auth/dev-login` | Development only; mounted only when `Deps.DevLogin` is set. Plain chi route, not a Huma operation. |
| `GET /api/groups` | List the user's groups. |
| `POST /api/groups` | Create a group. |
| `GET /api/groups/{groupId}` | Get one group. |
| `PATCH /api/groups/{groupId}` | Rename a group. |
| `DELETE /api/groups/{groupId}` | Delete a group and its items. |
| `GET /api/groups/{groupId}/items` | List a group's items. |
| `POST /api/groups/{groupId}/items` | Create an item. |
| `GET /api/groups/{groupId}/items/{itemId}` | Get one item. |
| `PATCH /api/groups/{groupId}/items/{itemId}` | Update an item. |
| `DELETE /api/groups/{groupId}/items/{itemId}` | Delete an item. |

If `Deps.WebRoot` is non-empty, `NewRouter` also registers `spaHandler` as the
mux's `NotFound` handler.

### Request handling conventions

- **Authentication.** Every group and item handler resolves the caller from the
  `__Host-session` cookie via the shared `authenticateSession` helper, which
  returns a `401` on a missing, unknown, or expired session. The resolved user
  ID scopes every Firestore path; it is never taken from a request parameter.
- **CSRF.** Every state-changing route (`POST`/`PATCH`/`DELETE`, and the auth
  `POST`s) calls `validateOrigin`: the `Origin` header must be present and equal
  to `Deps.AppOrigin`, otherwise `403`. This sits on top of the same-origin
  deployment and the `SameSite=Lax` cookie.
- **Group scoping for items.** Every item handler first calls `requireGroup`
  (wrapping `GetGroup`); a missing or foreign `groupId` returns `404` before the
  item store is touched. Firestore subcollections don't require the parent
  document to exist, so this check is what prevents orphaned items.
- **Validation.** Group `name` and item `title` are required, 1–100 characters;
  item `completedVolume` is an integer `>= 0`. Enforced with Huma struct tags
  (`minLength`/`maxLength`/`minimum`), which return `422` on violation.
- **Not-found.** `GET`/`PATCH` on a missing group or item return `404`.
- **Idempotent delete.** `DELETE` on a group or item returns `204` whether or
  not the target existed (for an item, as long as the group exists). Deleting a
  group cascades to its items first.

### Response bodies

- User: `{ "name": string, "pictureUrl": string }`
- Group: `{ "id": string, "name": string }`
- Item: `{ "id": string, "title": string, "completedVolume": number }`

`GET /api/hello` returns `{ "message": "Hello, World!" }` (Huma also adds a
`$schema` field).

## SPA static serving (`internal/server/static.go`)

`spaHandler(webRoot)` is the `NotFound` fallback, so it only sees paths no API
route matched:

- A path starting `/api/` gets a plain `404` — an API typo is never answered
  with `index.html`.
- The request path is cleaned (rooted `path.Clean`) so `..` cannot escape
  `webRoot`.
- An existing file is served with `http.ServeFile`. Files under `/assets/` (Vite
  content-hashes them) get `Cache-Control: public, max-age=31536000, immutable`;
  anything else gets `no-cache`.
- A missing `/assets/*` file gets `404` — never `index.html`, so a stale bundle
  can't receive HTML as a module.
- Any other unmatched `GET`/`HEAD` gets `index.html` with `no-cache`, letting
  the client router handle deep links. Other methods get `404`.

There is no startup existence check on `WEB_ROOT`; a broken layout just `404`s
per request.

## Google ID Token verification (`internal/googleauth`)

`Verifier` is an interface. `GoogleVerifier` calls
`google.golang.org/api/idtoken`'s `Validate` (signature, `aud`, `exp`) and adds
an explicit `iss` check against `accounts.google.com` /
`https://accounts.google.com`. It extracts `sub`, `email`, `name`, and `picture`
into a `Claims` struct. `FakeVerifier` returns fixed claims regardless of the
token and backs both the handler tests and the Dev Login path.

## Persistence (`internal/store`)

Four interfaces — `UserStore`, `SessionStore`, `GroupStore`, `ItemStore` — with
two implementations:

- **`FirestoreStore`** is the real one. It talks to Firestore (or the local
  emulator, auto-selected by the client library via `FIRESTORE_EMULATOR_HOST`).
  Documents:
  - `users/{sub}` — email, display name, picture URL, created/updated timestamps.
  - `sessions/{sha256(rawSessionId)}` — `userId`, created/expires timestamps. The
    raw session ID is only ever in the cookie; storage sees only its SHA-256.
  - `users/{sub}/groups/{groupId}` — name, timestamps.
  - `users/{sub}/groups/{groupId}/items/{itemId}` — title, completed volume,
    timestamps.
  Groups and items are queried `OrderBy("createdAt", Asc)`. Group/item IDs are
  random opaque strings (`NewDoc`-assigned or generated). Timestamps are
  truncated to microseconds to match what Firestore stores.
  `DeleteExpiredForUser` queries `sessions` by a single `userId ==` equality
  (auto-indexed, no composite index) and checks expiry client-side.
  `Lookup` deletes an expired session before returning "not found".
  `DeleteGroup` deletes the `items` subcollection document-by-document, then the
  group document; every delete is a no-op if the target is already gone, so a
  retry converges.
- **`MemoryStore`** is an in-memory double used by the fast handler tests
  (`groups_test.go`, `items_test.go`, `auth_test.go`). It keeps groups and items
  in insertion-ordered slices tagged with their owning user (and group).

## Tests & local dev

- `apps/api/justfile`: `dev` (`go run ./cmd/server`), `firestore-emulator` (runs
  the emulator on port 8090 for local dev), `build`, `test` (spins up a
  throwaway emulator on port 8091 so the Firestore integration tests run under
  `go test ./...`), `lint` (`go vet`), `format` / `format-check` (`gofmt`), and
  `check` (all of the above).
- `apps/api/.env` (loaded by `just`'s `dotenv-load`) holds local config; see
  `.env.example`. Locally, `APP_ORIGIN` is the Vite origin
  (`http://localhost:5173`), not the Go server's own port.
