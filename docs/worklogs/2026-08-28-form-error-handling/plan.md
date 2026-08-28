---
date: 2026-08-28
status: merged
discussions: [0012-form-error-handling, 0014]
decisions: [0005-form-and-fetch-error-feedback]
pr: null
---

# API error feedback for forms and fetches

Implementing
[0012-form-error-handling proposal](../../discussions/0012-form-error-handling/proposal.md):
give the user visible feedback when an API call fails, both on submit
(create/update/delete) and on fetch (list/detail GET), instead of the
current silent failure (write side: no `catch`, so a failed submit just
looks like a dead button; read side: failures are masked as "0 items" or an
infinite loading skeleton).

## Plan

- Add `apps/web/src/lib/use-submit.ts` (`useSubmit`) and
  `apps/web/src/lib/use-fetch.ts` (`useFetch`), per the proposal's sketch.
- Add `apps/web/src/components/ErrorState.tsx`, mirroring `EmptyState`.
- Wire `useFetch` + `ErrorState` into `GroupsListPage`, `GroupDetailPage`
  (both its group fetch and its item-list fetch), `GroupEditPage` (initial
  load), `ItemEditPage` (initial load), `ItemDetailPage`.
- Wire `useSubmit` into `GroupNewPage`, `GroupEditPage` (update + delete),
  `ItemNewPage`, `ItemEditPage` (update + delete), including the delete
  path that goes through `DeleteConfirmDialog`.
- Add inline error message rendering to each form/dialog, fixed Japanese
  copy per the proposal (no toast, no API detail passthrough).
- Update/add component tests for the new failure-path behavior (currently
  no test exercises the failure branch at all, since there was nothing to
  assert).

## What was done

- `lib/use-fetch.ts` (new): `useFetch(fetcher)` returns
  `{ status: 'loading' | 'success' | 'error', data?, refetch }`. A
  `requestId` ref guards against a stale in-flight request (from a dep
  change or a manual `refetch()`) overwriting newer state, and against
  updating state after unmount.
- `lib/use-submit.ts` (new): `useSubmit(action, errorMessage)` returns
  `{ isSubmitting, error, submit }`. `submit(...)` resolves to
  `{ ok: true, value } | { ok: false }` — see Difficulties below for why
  this isn't the proposal's plain `R | undefined`.
- `components/ErrorState.tsx` (new): mirrors `EmptyState` — centered
  message + a "再試行" button calling the caller's `onRetry`.
- `components/DeleteConfirmDialog.tsx`: added an optional `error` prop,
  rendered between the description and the footer buttons.
- `pages/groups/GroupsListPage.tsx`, `pages/groups/items/ItemDetailPage.tsx`:
  switched from local `useState`/`useEffect` fetching to `useFetch`, added
  an `ErrorState` branch.
- `pages/groups/GroupDetailPage.tsx`: two independent `useFetch` calls (group,
  item list), each with its own `ErrorState` — the item-list `ErrorState`
  only replaces the item section, the group `ErrorState` replaces the whole
  page.
- `pages/groups/GroupEditPage.tsx`, `pages/groups/items/ItemEditPage.tsx`:
  `useFetch` for the initial load (`ErrorState` instead of the old
  persistent skeleton on failure); two separate `useSubmit` instances (save,
  delete) so their `isSubmitting`/`error` don't interfere; inline error
  paragraph above the form buttons; `error` passed through to
  `DeleteConfirmDialog` so a failed delete surfaces inside the still-open
  dialog instead of nowhere.
- `pages/groups/GroupNewPage.tsx`, `pages/groups/items/ItemNewPage.tsx`:
  `useSubmit` wired into `handleSubmit`, inline error paragraph.
- Tests: rewrote the three existing tests that asserted the *old buggy*
  behavior (`GroupsListPage`, `GroupDetailPage`, `ItemDetailPage`,
  `App.test.tsx`) to assert `ErrorState` instead; added a retry-then-succeed
  test; added a new test on `GroupDetailPage` covering the
  group-succeeds-but-items-fail case (previously not distinguishable, so
  never tested); added `GroupNewPage.test.tsx`, `GroupEditPage.test.tsx`,
  `ItemNewPage.test.tsx`, `ItemEditPage.test.tsx` from scratch (none of the
  four form pages had any test file before this worklog).
- Verified `just check` (format-check, lint, test, build) passes end to end.
- Verified live in a real browser: started the Firestore emulator +
  `just apps/api/dev` + `just dev-web` and hit `/groups`, `/groups/new`
  unauthenticated. Unlike prior worklogs, this didn't need a real session —
  an unauthenticated GET/POST genuinely 401s from the live API, which is
  enough to exercise the real failure path end to end. `/groups` rendered
  the new `ErrorState` ("読み込みに失敗しました。" + "再試行"), and clicking
  "再試行" fired a real `GET /api/groups` (confirmed via the network panel).
  Submitting `/groups/new` reproduced the *exact* scenario from the original
  discovery.md bug report (tap "作成する", nothing seems to happen) and
  confirmed it now shows "保存できませんでした。もう一度お試しください。"
  inline, with the button re-enabled and the typed group name preserved.

## Difficulties

- **The proposal's `useSubmit` sketch silently breaks for void-returning
  actions.** The sketch had `submit` resolve to `R | undefined` and callers
  do `if (result) navigate(...)`. `deleteGroup`/`deleteItem` return
  `Promise<void>`, so a *successful* delete resolves to `undefined` — the
  exact same value the sketch's `catch` branch returns on failure. Using the
  sketch as written would have made every delete silently stop navigating
  away on success (or, worse, an inconsistent mix depending on which action
  happens to return a truthy value). Changed `submit`'s return type to a
  discriminated `{ ok: true; value: R } | { ok: false }` so success/failure
  is never inferred from truthiness. This wasn't visible in the proposal's
  sketch because it only worked through the create/update examples (both
  return the entity), never delete.

- **`react-hooks/set-state-in-effect` (part of this repo's
  `eslint-plugin-react-hooks` `recommended-latest` config) rejects a
  synchronous `setState` call reachable from inside a `useEffect` body**,
  which two natural implementations hit:
  - `useFetch`'s effect calling a `load()` that set `status: 'loading'`
    synchronously before starting the fetch. Fixed by only doing that reset
    from `refetch` (called from a retry button, never from inside an
    effect) — the effect-triggered fetch relies on the state already
    defaulting to `loading`, so it doesn't need to re-set it. This matches
    the pre-existing per-page effects, which never reset state on a dep
    change either (i.e. no new UX regression, just preserving an existing
    limitation).
  - `GroupEditPage`/`ItemEditPage` originally used `useEffect(() => { if
    (fetch.status === 'success') setName(...) }, [fetch])` to seed local
    editable form state once the initial fetch resolves — the direct
    hook-ification of the pre-existing `.then(result => setName(...))`
    pattern. Replaced with React's documented "adjust state during render"
    pattern (track an `initializedGroupId`/`initializedItemId` and call
    `setState` directly in the render body, guarded by an equality check)
    instead of an effect. This is not just a lint workaround — it also
    removes an extra render pass that the effect version would have had.

- **A pre-existing flaky test surfaced during `just check`**:
  `lib/auth.test.tsx`'s "starts loading, then becomes unauthenticated when
  /api/me fails" failed once
  (`TypeError: Cannot read properties of undefined (reading 'accounts')` at
  `lib/auth.tsx:118`) in a full-suite run, but passed in isolation and in
  9 of 10 subsequent full-suite runs. Reproduced the same single-run failure
  rate on the pre-change codebase too (via `git stash`), so this is
  pre-existing flakiness (looks like a cross-file race around the real
  `<script>` tag `AuthProvider` injects into `document.head`, not anything
  this worklog touched) — left as is, out of scope here. This looked
  structural rather than a one-off, so it became a new discovery:
  [0014](../../discussions/0014/discovery.md).

- **Real browser verification was possible this time**, unlike worklogs
  0004-item-groups-crud and 2026-08-27-items-crud, which both hit a hard
  wall trying to inject a session cookie for authenticated testing. This
  worklog didn't need to get past that wall: the pages/paths being changed
  here (fetch-failure and submit-failure display) are exercised just as
  well by a *real* 401 from an unauthenticated request against the live
  server as by an authenticated one — the failure path doesn't care why the
  request failed. Worth noting for future worklogs: "can't get an
  authenticated session" doesn't always mean "can't verify in a real
  browser."
