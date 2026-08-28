# 0004: Item entity CRUD

Discussion: [item entity CRUD](../discussions/0011-items-crud/proposal.md)
Worklog: [Item entity CRUD](../worklogs/2026-08-27-items-crud/plan.md)

## Status

Accepted.

## Decision

- Item CRUD ships end to end: `GET/POST /api/groups/{groupId}/items` and
  `GET/PATCH/DELETE /api/groups/{groupId}/items/{itemId}`, backed by a new `ItemStore`
  (`MemoryStore` + `FirestoreStore`) that follows the `GroupStore` pattern, scoped by the
  authenticated user's `sub` and by `groupId`. Store methods are entity-qualified
  (`ListItems`/`CreateItem`/`GetItem`/`UpdateItem`/`DeleteItem`) for the same reason as
  `GroupStore`: Go has no method overloading and both stores hang off the same structs.
- Every item handler resolves `groupId` through a shared `requireGroup` helper (wrapping
  `GetGroup`) before the item store is touched; a missing or foreign `groupId` returns 404.
  Firestore subcollections do not require their parent document to exist, so this check is the
  only thing preventing an item from being created under a deleted or another user's group.
  `groupId` and `itemId` validation are independent.
- `GET` and `PATCH` return 404 for a missing `itemId`. `DELETE` returns 204 whenever `groupId`
  exists, including for an already-deleted or never-existing `itemId`, matching `DeleteGroup`'s
  idempotency ([0003](0003-group-entity-crud.md)). `DeleteItem` is a plain document delete with
  no cascade, since items have no subcollections.
- An item title is required and limited to 1–100 characters; the completed volume is an integer
  `>= 0`. Both are enforced via Huma struct tags (`minLength`/`maxLength`/`minimum`) and the
  frontend inputs, the same pattern as the group name.
- Firestore documents follow `users/{sub}/groups/{groupId}/items/{itemId}`; items are listed in
  creation order.
- The frontend gets a new `/groups/:groupId/items/:itemId` detail page (title, completed volume,
  edit button), mirroring the group detail page. This settles the item-detail URL question
  deferred from [0010](../discussions/0010-item-groups/proposal.md) in favour of nesting under
  the group rather than a flat `/items/:itemId`. The group detail page's item rows now link to
  this detail page instead of straight to edit. `ItemEditPage` loads its initial data from the
  new single-resource GET instead of listing items and calling `.find()`; `api.getItem` is
  added.
- Item create, update, and delete all navigate to `/groups/:groupId` (the group detail page,
  which is the item list) on success, replacing the removed `/groups/:groupId/items` URL. This
  fixes the stale-navigation inconsistency recorded in worklog
  [0004-item-groups-crud](../worklogs/0004-item-groups-crud/README.md).
- This resolves the item half of
  [0005](../discussions/0005-single-resource-get-for-groups-and-items/discovery.md); with the
  group half already resolved by [0003](0003-group-entity-crud.md), 0005 is now fully resolved.
- Still deferred: the item-list pagination scheme and page size (the list currently returns all
  items unpaginated;
  [0001](../discussions/0001-purpose-and-initial-tech-stack/proposal.md)'s decision to have
  pagination stands), moving an item to another group, and the concrete rendering of
  API-failure error states (deferred since
  [0004-home-and-login](../discussions/0004-home-and-login/proposal.md), carried through 0010
  and here — now its own discovery,
  [0012](../discussions/0012-form-error-handling/discovery.md)).

## Rationale

Mirroring the `GroupStore`, the group detail page, and the group navigation flow keeps items and
groups symmetric — list -> detail -> edit — which is the flow both operational paths in the
discovery describe. The `requireGroup` pre-check is load-bearing rather than defensive: without
it, trusting the path structure alone would let orphaned items accumulate under a nonexistent
group, because Firestore does not validate the subcollection parent on write. Reusing
`DeleteGroup`'s always-204 contract for `DeleteItem` lets a client retry a delete without
special-casing "already gone." Nesting the item detail URL under its group keeps every item
URL — new, edit, and now detail — carrying its full group context, rather than introducing a
second, flat addressing scheme.
