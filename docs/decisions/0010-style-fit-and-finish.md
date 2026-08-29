# 0010: Style fit-and-finish — one font family, no in-app back links, section-head create actions

Discussion: [style fit-and-finish](../discussions/0021-style-fit-and-finish/proposal.md)
Worklog: [style fit-and-finish](../worklogs/0010-style-fit-and-finish/plan.md)

## Status

Accepted. Revises the font paragraph of
[0006](0006-visual-style-system.md) and the empty-state CTA convention of
[0009](0009-frontend-app-structure.md). Closes discoveries
[0019](../discussions/0019-selfhosted-font-subset-mismatch/discovery.md) and
[0020](../discussions/0020-detail-page-parent-context/discovery.md).

## Decision

A fit-and-finish pass on the moss × rounded-gothic UI
([0006](0006-visual-style-system.md)) after living with it in `apps/web`.

- **One font family.** `--font` is a single OS rounded-gothic stack
  (`ui-rounded`, Hiragino Maru Gothic, Yu Gothic UI / Meiryo, `system-ui`,
  `sans-serif`), used for chrome and user-entered content alike. `--font-ugc`,
  the `.ugc` class, and the `@fontsource/zen-maru-gothic` dependency (three
  Latin `.woff2`, ~35 KB) are removed; **no web font is bundled or fetched.**
  This replaces 0006's two-stack split. Rounded rendering is now best-effort —
  guaranteed only where the OS ships a rounded gothic (Apple; Windows via Yu
  Gothic UI) and otherwise a plain system sans. This is also the resolution of
  discovery 0019 (the `--font` token no longer over-promises a bundled asset,
  because there is no asset).

- **Heading-mini button size.** `Button` gains `size="xs"` (`.btn-xs`, ~26px,
  sized from the h1 ink height) for a button sitting inside a `.sectionhead`
  next to an h1/h2. `.sectionhead` aligns its children `align-items: baseline`,
  so the button tracks the heading's cap and foot and stays on the first line
  of a wrapped heading. `.btn-sm` (36px) is unchanged — toolbar / form submit +
  delete. `/groups` now uses a `.sectionhead` (title + `xs` New group) like the
  group-detail heads, not `.pagetitle` + a separate toolbar.

- **No in-app back links.** Every `.backlink` (`← Groups` / `← Back` on the
  detail, new, and edit pages) is gone. Upward / return navigation is the
  browser back button plus the header wordmark, now a `<Link to="/">` (which
  redirects an authenticated visitor to `/groups`). This resolves discovery
  0020: with no parent-name back link, item-detail no longer needs a per-view
  `GET /api/groups/{id}`.

- **The create action lives in the section heading, not the empty card.** On
  both list screens (`/groups`, and `/groups/:groupId`'s Items) the create
  button (`New group` / `Add item`) sits in the section head and shows even
  when the list is empty; `EmptyState` there is a message with no CTA.
  `EmptyState`'s CTA props are now optional. This revises 0009's "EmptyState =
  message + create CTA" and supersedes worklog 0009's "hide the head button
  while the list is empty".

- **Two placements.** Item rows: `vol. N` is a fixed three-digit right-aligned
  column (ones digit lines up down the list). Edit pages: the delete button
  sits below a full-width hairline, right-aligned — placement only; still
  default size, still initiated from the edit page via `DeleteConfirmDialog`.

## Rationale

The two-font split existed to keep a self-hosted rounded face off Japanese body
text; once chrome copy was all English (worklog 0009) that face only ever
rendered Latin, so vendoring it bought little and drifted from its token
(0019). One family is simpler and "rounded where the OS has it, plain sans
otherwise" is acceptable here. Back links duplicated the browser back button
and, for item-detail, forced a choice between an extra request per view and a
degraded UI (0020). Keeping the create action only in the section head gives
every list screen — empty or not — one create affordance in one fixed place.
