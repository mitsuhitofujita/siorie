---
date: 2026-08-27
status: in-progress
discussions: [0011-items-crud]
decisions: []
pr: null
---

# Item entity CRUD

Implementing the item entity CRUD end to end (backend + frontend), per
[0011-items-crud proposal](../../discussions/0011-items-crud/proposal.md).

Triggered by a user bug report after trying the group→item creation flow live:
tapping "作成する" (create) on the new-item form did nothing — no item was
created, no navigation happened. Root cause: `apps/api` has no item endpoints
at all yet (only groups), so `api.createItem` always 404s, and
`ItemNewPage.handleSubmit` doesn't catch the resulting error, so the failure
is silent. This is exactly the gap the 0011 proposal describes and scopes to
close.

## Plan

- Backend: add `ItemStore` (`MemoryStore` + `FirestoreStore`) following the
  `GroupStore` pattern, then register `GET/POST /api/groups/{groupId}/items`,
  `GET/PATCH/DELETE /api/groups/{groupId}/items/{itemId}`. Every handler
  validates `groupId` via `GetGroup` first (404 if missing/foreign) before
  touching items.
- Frontend: add `api.getItem`; add `ItemDetailPage` at
  `/groups/:groupId/items/:itemId`; fix `ItemNewPage`/`ItemEditPage` to
  navigate to `/groups/:groupId` (not the removed `/groups/:groupId/items`)
  on success; switch `ItemEditPage` from list+`.find()` to `getItem`; update
  `GroupDetailPage`'s item row links to point at the new detail page instead
  of straight to edit.

## What was done

Backend (`apps/api`):

- `internal/store/types.go`: added `Item`, `ItemStore` (`ListItems`/
  `CreateItem`/`GetItem`/`UpdateItem`/`DeleteItem`, scoped by `userID` and
  `groupID`), `ErrItemNotFound`.
- `internal/store/memory.go`: implemented `ItemStore` on `MemoryStore` with
  an insertion-ordered slice, same pattern as `GroupStore`.
- `internal/store/firestore.go`: implemented `ItemStore` on `FirestoreStore`
  against `users/{sub}/groups/{groupId}/items/{itemId}`, ordered by
  `createdAt`. `DeleteItem` is a plain idempotent document delete (no cascade
  needed, unlike `DeleteGroup`).
- `internal/server/items.go` (new): registered `GET/POST
  /api/groups/{groupId}/items` and `GET/PATCH/DELETE
  /api/groups/{groupId}/items/{itemId}`. Every handler calls a new
  `requireGroup` helper (wraps `GetGroup`) first, so a missing/foreign
  `groupId` 404s before the item store is ever touched — Firestore
  subcollections don't require their parent document to exist, so this is
  the only thing stopping items from being created under a deleted or
  someone else's group. `title` validated via `minLength`/`maxLength`
  (1–100), `completedVolume` via `minimum:"0"`. `DELETE` returns 204
  whenever `groupId` exists, even for an already-deleted or nonexistent
  `itemId`, matching `DeleteGroup`'s idempotency.
- `internal/server/server.go`, `cmd/server/main.go`: wired `Items` through
  `Deps` the same way `Groups` already was.
- Tests: `internal/server/items_test.go` (new) covers auth-required,
  origin-rejection, missing-group 404 on all five routes, full CRUD
  lifecycle, idempotent delete (including delete of a nonexistent item
  under an existing group), 404s for a missing item, validation errors
  (empty/too-long title, negative volume), and per-user scoping (a second
  user can't list or get items under the first user's group — it 404s at
  the group check before ever reaching the item). `internal/store/
  firestore_test.go` gained the equivalent integration tests against the
  real Firestore emulator (create/get/update/delete, missing-item 404,
  creation-order listing scoped per group).

Frontend (`apps/web`):

- `lib/api.ts`: added `getItem`; removed the stale comment about items
  lacking a single-resource GET.
- `pages/groups/items/ItemDetailPage.tsx` (new): mirrors `GroupDetailPage`
  — shows title/volume and an edit button, ported the same
  loading/not-found skeleton pattern.
- `pages/groups/items/ItemNewPage.tsx`: `navigate` target fixed from the
  removed `/groups/${groupId}/items` to `/groups/${groupId}` on success —
  this is the actual fix for the reported bug (see below).
- `pages/groups/items/ItemEditPage.tsx`: initial data now comes from
  `api.getItem` instead of `listItems().find()`; both update and delete
  now `navigate` to `/groups/${groupId}` instead of the removed URL.
- `pages/groups/GroupDetailPage.tsx`: item row links now point at
  `/groups/:groupId/items/:itemId` (detail) instead of straight to
  `.../edit`.
- `App.tsx`: added the `/groups/:groupId/items/:itemId` route.
- Tests: new `ItemDetailPage.test.tsx`; updated `GroupDetailPage.test.tsx`'s
  item-link assertion for the new target.

## Verification

- `just apps/api/check` (format-check, `go vet`, tests incl. the
  Firestore-emulator integration tests, build) — all green.
- `pnpm format:check` / `pnpm lint` / `pnpm test` (27 tests) / `pnpm build` —
  all green.
- Started the real stack (Firestore emulator + `just apps/api/dev` + `just
  dev-web`), seeded a user/session directly into the emulator via its REST
  API (same technique as worklog 0004-item-groups-crud), and reproduced the
  exact flow from the bug report against the live server: `POST /api/groups`
  → `POST /api/groups/{groupId}/items` with the new group's id now returns
  200 with the created item instead of 404. Also drove the full
  `GET(single)/GET(list)/PATCH/DELETE/DELETE(idempotent)/GET(404)` sequence,
  confirmed `POST` under a nonexistent `groupId` 404s, and confirmed
  `DELETE /api/groups/{groupId}` cascades to delete items under it
  (`GET` on the item afterward 404s, via the group check).
- Opened `http://localhost:5173/groups/g1/items/i1` unauthenticated in a
  real browser: renders the persistent loading skeleton (expected — both
  the group and item fetches 401), no console errors.

## Difficulties

- **The reported bug wasn't actually about the create button being
  broken** — it was that `ItemNewPage.handleSubmit` has no `catch`, so when
  `api.createItem` 404s (no backend existed), the error is silently
  swallowed by the unhandled promise rejection path and `isSubmitting` just
  resets via `finally`. From the user's side this looks exactly like "the
  button does nothing." Implementing the 0011 proposal's backend removes
  the 404, so the button now works, but the missing `catch` (silent
  failure on any future backend error) is still there — it's explicitly
  out of scope per the proposal ("API失敗時のエラー状態の具体的な表示" is
  deferred), so it's left as is here, not fixed as a drive-by. This looked
  structural rather than a one-off, so it became a new discovery:
  [0012](../../discussions/0012/discovery.md).

- **Authenticated browser verification was not possible, same as worklog
  0004-item-groups-crud**: a real Google sign-in needs a real Google account
  and OAuth credentials unavailable in this environment. Injecting the
  session cookie via `document.cookie` from the browser-automation tool was
  blocked by the harness's own guard (`[BLOCKED: Cookie/query string
  data]`) — treated as a reasonable session-hijacking defense, so no
  workaround was sought, exactly as 0004 recorded. Backend verification
  instead used direct Firestore-emulator seeding + `curl` against the real
  running server (see Verification), which is how the originally-reported
  bug (create button doing nothing) was directly reproduced-then-fixed at
  the API level. The browser side was checked unauthenticated only
  (persistent skeleton, no console errors) plus full component/route unit
  tests with mocked `fetch`. Hitting the exact same wall a second time (0004
  predicted it, this worklog confirmed it) looked structural rather than a
  coincidence, so it became a new discovery:
  [0013](../../discussions/0013/discovery.md).

