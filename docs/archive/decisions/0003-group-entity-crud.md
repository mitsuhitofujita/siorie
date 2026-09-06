# 0003: Group entity CRUD

Discussion: [item groups CRUD](../discussions/0010-item-groups/proposal.md)
Worklog: [Group entity CRUD](../worklogs/0004-item-groups-crud/README.md)

## Status

Accepted. The "no dedicated route guard for unauthenticated `/groups/**`" point
is superseded by [0008](0008-route-level-auth-split.md), which adds a
client-side `<RequireAuth>` guard; every other point stands.

## Decision

- Group CRUD ships end to end: `GET/POST /api/groups` and `GET/PATCH/DELETE /api/groups/{groupId}`,
  backed by a new `GroupStore` (`MemoryStore` + `FirestoreStore`) that follows the existing
  `UserStore`/`SessionStore` pattern, scoped by the authenticated user's `sub`. Store methods are
  named `<Entity><Verb>` (`ListGroups`, `CreateGroup`, `GetGroup`, `UpdateGroup`, `DeleteGroup`)
  rather than mirroring `UserStore`/`SessionStore`'s bare verb names, since Go has no method
  overloading and a future `ItemStore` on the same structs would otherwise collide.
- A group name is required and limited to 1–100 characters, matching the item title limit;
  enforced via Huma's `minLength`/`maxLength` struct tags on the API and `maxLength` on the
  frontend inputs.
- `DELETE /api/groups/{groupId}` deletes the group's `items` subcollection before the group
  document itself, and always returns 204 regardless of whether the group existed or belonged to
  the caller. Both steps are no-ops on an already-missing document, so a retried delete converges
  safely.
- The frontend gets a new `/groups/:groupId` detail page (name, item list/empty state, edit
  button), replacing `/groups/:groupId/items`. The groups list now links each row to the detail
  page instead of straight to edit. `GroupEditPage` loads its initial data from
  `GET /api/groups/{groupId}` instead of fetching the full list and calling `.find()`.
- Unauthenticated access to `/groups/**` gets no dedicated route guard. A 401 from any group
  endpoint is treated as a generic API-failure error state, resolving
  [0006](../discussions/0006-unauthenticated-route-guard/discovery.md). The concrete rendering of
  that error state is still deferred, so the visible behavior is unchanged until that is decided.
- This also resolves the group half of
  [0005](../discussions/0005-single-resource-get-for-groups-and-items/discovery.md) via the new
  single-resource GET; the item half stays open until item CRUD is designed.
- Item entity CRUD, the item detail page's URL design, and the concrete rendering of API-failure
  error states remain out of scope and are deferred to future discussions.

## Rationale

Naming store methods per-entity avoids a known Go limitation before it bites a second time on
`ItemStore`. Cascading the delete item-subcollection-first, with each step idempotent, lets a
client safely retry a delete without special-casing "already gone." Routing edit through the new
detail page, rather than keeping a direct list→edit link, matches the two operational flows
discovery.md described, both of which pass through a detail view before editing. Folding 0006 into
a general error-state policy avoids building a second, redundant auth-guard mechanism when the
general error-state design (still pending from 0004) will need to cover this case anyway.
