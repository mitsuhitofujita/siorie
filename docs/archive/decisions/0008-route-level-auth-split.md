# 0008: Route-level auth split and a self-contained GoogleSignInButton

Discussions: [home signin button lifecycle](../discussions/0015-home-signin-button-lifecycle/proposal.md), [home and login](../discussions/0004-home-and-login/proposal.md), [unauthenticated route guard](../discussions/0006-unauthenticated-route-guard/discovery.md), [home with auth](../discussions/0009-home-with-auth/proposal.md)
Worklog: [route-level auth split and a self-contained GoogleSignInButton](../worklogs/0008-home-signin-button-lifecycle/plan.md)

## Status

Accepted. Reverses two points of discussion
[0004-home-and-login](../discussions/0004-home-and-login/proposal.md), supersedes
discussion [0009-home-with-auth](../discussions/0009-home-with-auth/proposal.md),
resolves discussion
[0006-unauthenticated-route-guard](../discussions/0006-unauthenticated-route-guard/discovery.md),
and supersedes the route-guard point of [0003](0003-group-entity-crud.md).

## Decision

- Auth-state screen switching moves out of `HomePage`'s three `state.status`
  early returns and into the route layer:
  - `/` → `RootRoute`: no UI. A minimal skeleton while auth is `loading`,
    otherwise `<Navigate>` to `/groups` (authenticated) or `/login`
    (unauthenticated). This is the only place `loading` is handled explicitly.
  - `/login` → `LoginPage`, wrapped in `<RequireGuest>`: the moved
    unauthenticated view (title + sign-in button), with its own skeleton while
    `loading`. Post-login navigation to `/groups` is `<RequireGuest>`'s job.
  - `/groups/*` → the `AppLayout` route element, wrapped once in
    `<RequireAuth>`.
  - `RequireAuth` / `RequireGuest` live in `components/route-guards.tsx`:
    settled `unauthenticated` → `/login`, settled `authenticated` → `/groups`,
    respectively; `loading` and the allowed state fall through to each page's
    own loading UI.

- `GoogleSignInButton` is a new component exported from `@/lib/auth`. It owns
  its container `ref`, calls `google.accounts.id.renderButton` into that
  container once GIS is ready, and on unmount clears **only its own** container
  (`replaceChildren()`), so a StrictMode double-mount cannot stack two buttons.
  The imperative `AuthContextValue.renderSignInButton(container)` API is
  removed; the context now carries `gisReady: boolean` instead, since the button
  renders elsewhere in the tree and needs a readiness signal. `AuthProvider`
  provides `{ state, gisReady, logout }`. The button is not auth-state-gated —
  "no sign-in button when authenticated" is now a routing property (it is only
  mounted on `/login`), not a property of the component.

- The orphaned-iframe bug is structurally unreachable, not patched: on sign-in
  the auth state flips to `authenticated`, `<RequireGuest>` navigates away from
  `/login`, `LoginPage` unmounts, and React removes the button's `<div>` with
  Google's injected `<iframe>` inside it.

- `HomePage.tsx` and its test are deleted. The authenticated home (avatar +
  name + Groups link + Log out) is gone; `/` holds no UI. The signed-in user's
  name is shown in the `NavMenu` sheet (Groups link and Log out were already
  there).

- [Decision 0002](0002-google-id-token-auth.md)'s "always render Google's own
  `renderButton()` output" stands; `GoogleSignInButton` is only a wrapper around
  that call and does not move to `prompt()` or a plain button.

- `RootRoute` and `LoginPage` carry a byte-identical `loading` skeleton. This is
  deliberate: centralizing loading UI in a guard was rejected in the discussion
  as double-ownership. Do not "de-duplicate" it back into a shared component.

### Reversals and supersessions

- **Discussion [0004-home-and-login](../discussions/0004-home-and-login/proposal.md)**,
  two points:
  1. "No dedicated `/login` page — the login button starts sign-in in place" →
     there is now a `/login` route.
  2. "The authenticated home keeps account info + Groups link + Log out; `/`
     does not redirect straight to `/groups`" → `/` is redirect-only and
     authenticated users land on `/groups`.
  The rest of 0004 (common layout, nav menu, URL table, empty/loading states)
  stands.

- **[Decision 0003](0003-group-entity-crud.md)**: its "unauthenticated access
  to `/groups/**` gets no dedicated route guard; a 401 is treated as a generic
  API-failure error state" is superseded. `<RequireAuth>` is a dedicated
  client-side guard that redirects a known-unauthenticated visitor to `/login`
  before any `/groups` request is made. This is not redundant with the
  [0005](0005-form-and-fetch-error-feedback.md) error-state model: that still
  covers a session that expires mid-use (client believes it is authenticated,
  the API returns 401). The guard covers the case the client already knows is
  unauthenticated.

- **Discussion [0006-unauthenticated-route-guard](../discussions/0006-unauthenticated-route-guard/discovery.md)**
  is resolved — `<RequireAuth>` is that discovery's candidate 3 (treat the
  common layout as an auth-gated container).

- **Discussion [0009-home-with-auth](../discussions/0009-home-with-auth/proposal.md)**
  is superseded. Its A-plan (`key={state.status}`) was symptomatic; its B-plan
  (an effect cleanup that removes only Google's injected node) was disproven
  this session — the cleanup runs after React has committed the reused node, so
  it takes the avatar with it. Neither is adopted; the component-extraction
  approach here makes the node removal structural instead.

### Out of scope

- Deep-link return after login: no `location` stash. An unauthenticated visit to
  `/groups/xyz` goes to `/login` and then always to `/groups`. Known trade-off:
  that visitor briefly sees the target page's skeleton and fires one 401 before
  the redirect settles. Accepted as minor.
- The GIS loader still has no injection seam and no teardown — `<script>`
  appended to `document.head` and never removed, `window.google` a mutable
  global. Tests work around it with a `window.google` stub plus an `async
  afterEach` effect flush (see [0007](0007-auth-test-passive-effect-flush.md)).
  Not fixed here.

## Rationale

The bug's root is imperative `renderButton()` injection into a `<div>` React
reuses by position across the `unauthenticated` → `authenticated` transition, not
the act of switching UI by auth state. Giving the button its own component that
unmounts on the `/login` → `/groups` route change lets React's normal DOM
teardown remove the node — iframe included — so an orphan cannot occur rather
than being cleaned up after the fact. Moving the auth-state switch to the route
layer keeps `loading` handling in exactly one place (`/`) and leaves each
protected page its own loading UI, so no guard becomes a second loading-UI
owner. The dedicated `<RequireAuth>` is worth the extra mechanism that
[0003](0003-group-entity-crud.md) wanted to avoid: without it, a
known-unauthenticated visitor to a `/groups` URL sees an empty list and triggers
a spurious 401 before any redirect. Removing the authenticated home follows from
`/` becoming redirect-only; its name display had one remaining home, the
`NavMenu` sheet.
