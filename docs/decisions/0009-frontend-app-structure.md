# 0009: Frontend application structure — SPA routing, common layout, page conventions

Discussions: [home and login](../discussions/0004-home-and-login/proposal.md), [single-resource GET for groups and items](../discussions/0005-single-resource-get-for-groups-and-items/discovery.md), [unauthenticated route guard](../discussions/0006-unauthenticated-route-guard/discovery.md)
Worklog: [home, login, and common layout — frontend structure](../worklogs/0002-home-login-frontend-structure/README.md)

## Status

Accepted. Recorded retroactively: worklog 0002 landed on `main` in the
project's first week and its decision was never written. Several concrete
pieces below have since been revised — see "Superseded since".

## Decision

The React SPA structure established by [0004-home-and-login](../discussions/0004-home-and-login/proposal.md)
and built in this worklog (on the [0001](0001-monorepo-scaffold.md) scaffold).
The following still hold:

- **Client-side routing** with `react-router-dom`; `src/App.tsx` is the single
  route table.

- **URL design nests to match the Firestore data model**: `/groups`,
  `/groups/new`, `/groups/:groupId`, `/groups/:groupId/edit`,
  `/groups/:groupId/items/new`, `/groups/:groupId/items/:itemId`,
  `/groups/:groupId/items/:itemId/edit`. (The detail routes and the removal of a
  flat `/groups/:groupId/items` list URL came later — [0003](0003-group-entity-crud.md),
  [0004](0004-item-entity-crud.md) — but the nesting rule is from here.)

- **Create and edit are always separate pages**, never one page switched by
  presence of data. A create page has no loading state; an edit page shows a
  skeleton while it fetches.

- **Common layout for every route except `/`** (and now `/login`):
  `components/layout/AppLayout.tsx` — header (title left, account avatar right),
  footer (app name only, no other chrome). The avatar opens `NavMenu`, a
  slide-in sheet holding a Groups link and Log out.

- **Deletion is initiated from the edit page, not the list**, through a custom
  `DeleteConfirmDialog` modal — never the browser `confirm()`. Its buttons
  disable and the confirm button relabels while the delete is in flight.

- **Empty and loading states are first-class**: a list page renders a skeleton
  while loading and an `EmptyState` (fixed message + CTA to the matching create
  page) when the result is empty, not an empty list.

- **A thin typed `fetch` client** (`lib/api.ts`), one wrapper per endpoint, is
  the only place page code talks to the API.

- **Auth is a React context** (`lib/auth.tsx` `AuthProvider` / `lib/auth-context.ts`
  `useAuth`): `AuthState` is the three-value union
  `loading | unauthenticated | authenticated`, populated from `GET /api/me` on
  mount, with any non-2xx or network error treated as `unauthenticated`.
  Non-component exports (`useAuth`, the context object) live in their own module
  so Fast Refresh's component-only-export rule holds.

- **Tailwind CSS v4** is the styling pipeline (first introduced here; it
  survived the [0006](0006-visual-style-system.md) redesign).

- **Tests** run on Vitest + Testing Library + jsdom, with a `renderWithProviders`
  helper that injects an arbitrary `AuthState` so auth-state tests need no
  `fetch` mock.

Two gaps this worklog surfaced were spun off as their own discoveries and are
now resolved: no single-resource GET for a group/item
([0005](../discussions/0005-single-resource-get-for-groups-and-items/discovery.md)
→ [0003](0003-group-entity-crud.md) + [0004](0004-item-entity-crud.md)), and no
guard for unauthenticated access to `/groups/**`
([0006](../discussions/0006-unauthenticated-route-guard/discovery.md) →
[0008](0008-route-level-auth-split.md)).

### Superseded since

- **shadcn/ui**, adopted here as the component library, was removed by
  [0006](0006-visual-style-system.md); primitives are now hand-written on
  design tokens (Tailwind v4 itself stays).
- **`HomePage`** (loading / unauthenticated / authenticated branches) and the
  `login()` stub: the stub became the real Google Identity Services flow in
  [0002](0002-google-id-token-auth.md); `HomePage` was deleted in
  [0008](0008-route-level-auth-split.md), which moved auth-state switching to
  the route layer, added a dedicated `/login`, and removed the authenticated
  home.
- **Edit pages fetching the parent list and `.find()`ing**: replaced by
  single-resource `GET` in [0003](0003-group-entity-crud.md) /
  [0004](0004-item-entity-crud.md).
- **Per-page `useState`/`useEffect` fetching and catch-less submits**: replaced
  by the `useFetch` / `useSubmit` hooks and `ErrorState` in
  [0005](0005-form-and-fetch-error-feedback.md).

## Rationale

Nesting every item URL under its group keeps the group context in the path
rather than introducing a second flat addressing scheme. Separate create and
edit pages, and delete-from-edit through a custom modal, were chosen over
modal-everything and over a shared create/edit page so each screen has one job
and the delete confirmation is styleable. Treating empty and loading as
first-class states — not "an empty list happens to render nothing" — is what
later let a failed load be told apart from a slow one
([0005](0005-form-and-fetch-error-feedback.md)). The three-value `AuthState`
and the injectable-state test helper kept auth-dependent UI testable without a
network layer from the start.
