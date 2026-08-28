# 0005: Form and fetch error feedback

Discussion: [form and fetch API error display](../discussions/0012-form-error-handling/proposal.md)
Worklog: [API error feedback for forms and fetches](../worklogs/2026-08-28-form-error-handling/plan.md)

## Status

Accepted.

## Decision

- A failed API call now always produces visible feedback, on both the write side
  (create/update/delete) and the read side (list/detail GET). This settles the
  concrete rendering of API-failure error states, deferred since
  [0004-home-and-login](../discussions/0004-home-and-login/proposal.md) and
  carried forward through [0003](0003-group-entity-crud.md) and
  [0004](0004-item-entity-crud.md).

- Two shared hooks in `apps/web/src/lib/` replace the per-page
  `useState`/`useEffect` fetching and the catch-less `try` blocks:
  - `useFetch(fetcher)` returns
    `{ status: 'loading' | 'success' | 'error', data?, refetch }`. The status is
    an explicit three-value union, so a failed initial load renders as an error
    instead of an indeterminate state — previously
    `if (!group) return <Skeleton />` left a failed load showing the loading
    skeleton forever. A `requestId` ref discards a stale in-flight response (from
    a dep change or a manual `refetch()`) and suppresses state updates after
    unmount.
  - `useSubmit(action, errorMessage)` returns `{ isSubmitting, error, submit }`.
    `submit(...)` resolves to a discriminated
    `{ ok: true; value: R } | { ok: false }`, **not** the proposal's
    `R | undefined`. A void-returning action (`deleteGroup`, `deleteItem`)
    resolves to `undefined` on success, which the sketch could not tell apart
    from its failure return; the discriminated result keeps success and failure
    from ever being inferred from truthiness.

- `components/ErrorState.tsx` is a new component, not an `EmptyState` variant. It
  mirrors `EmptyState`: a centered fixed message plus a "再試行" button calling
  the caller's `onRetry`. `EmptyState` keeps its single "zero items + create CTA"
  responsibility.

- Error copy is fixed Japanese, chosen at the call site, never derived from the
  API response: "保存できませんでした。もう一度お試しください。" (write),
  "削除できませんでした。もう一度お試しください。" (delete),
  "読み込みに失敗しました。" (read). `apiFetch` is unchanged — it still throws on
  status alone and does not read the failure body.

- Wiring:
  - `useFetch` + `ErrorState` into `GroupsListPage`, `GroupDetailPage`,
    `GroupEditPage`, `ItemEditPage`, `ItemDetailPage`. `GroupDetailPage` runs two
    independent `useFetch` calls (group, item list) with different blast radius:
    a failed group fetch replaces the whole page, a failed item-list fetch
    replaces only the item section.
  - `useSubmit` into `GroupNewPage`, `GroupEditPage`, `ItemNewPage`,
    `ItemEditPage` for create/update/delete, with an inline `text-destructive`
    error paragraph above the form buttons. Each edit page uses two separate
    `useSubmit` instances (save, delete) so their `isSubmitting`/`error` do not
    interfere.
  - `DeleteConfirmDialog` gains an optional `error` prop, rendered between the
    description and the footer, so a failed delete surfaces inside the still-open
    dialog.

- The edit pages seed their editable form state from the initial fetch by
  adjusting state during render (guarded by an `initialized<Entity>Id` check),
  not in an effect. This is React's documented pattern for "adjust state when a
  prop changes", drops a render pass, and sidesteps
  `react-hooks/set-state-in-effect`.

- `error` persists until the next submit; typing in the form does not clear it.
  Each `submit(...)` call resets it first.

- Out of scope, unchanged from the proposal: a toast/notification system, 401
  special-casing (a 401 stays a generic error, per
  [0003](0003-group-entity-crud.md) and 0010), passing the API's own error detail
  through to the user, per-field server-side validation errors, and automatic
  retry/backoff (retry is a button press only).

## Rationale

The three-value `useFetch` status exists to kill the loading/error ambiguity that
made a failed initial load indistinguishable from a slow one. The discriminated
`useSubmit` result is the one real departure from the proposal: the sketch only
ran through create/update, both of which return the entity, so its `R | undefined`
contract silently failed for delete, where success is `undefined`. A dedicated
`ErrorState` rather than an `EmptyState` variant keeps each component's
responsibility single. Fixed local copy keeps implementation-detail English
(Huma's `"failed to create item"`) out of a Japanese UI and means `apiFetch`
needs no change. Seeding form state during render rather than in an effect removes
a render pass and matches the lint config the repo already runs.
