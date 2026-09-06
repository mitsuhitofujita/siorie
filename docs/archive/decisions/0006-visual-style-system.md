# 0006: Visual style system — moss × rounded gothic, shadcn/ui removed

Discussion: [visual style overhaul](../discussions/0016-visual-style-overhaul/proposal.md)
Worklog: [visual style overhaul](../worklogs/0009-visual-style-overhaul/plan.md)

## Status

Accepted. The font paragraph — the two-stack `--font` / `--font-ugc` split
and the self-hosted Zen Maru Gothic Latin subset — is revised by
[0010](0010-style-fit-and-finish.md): one OS rounded-gothic family for
everything, no web font. The rest stands.

## Decision

- The web UI adopts a bespoke design-token system defined as CSS custom
  properties in `apps/web/src/index.css`: a moss palette (every functional
  pair clears WCAG AA), a φ-based type scale (16·φ), Fibonacci-px spacing, and
  `8·φⁿ` radius with pill buttons. Layout is mobile-only, light-only, a single
  centred column ≤ 430 px with a hairline side border on wider viewports; the
  home screen keeps no common layout (per
  [0004 home and login](../discussions/0004-home-and-login/proposal.md)). The
  component styles are ported into an `@layer components` block and consumed as
  semantic classes (`className="btn btn-primary"`), not utility strings.

- **shadcn/ui is removed.** The generated `src/components/ui/` primitives are
  deleted along with `class-variance-authority`. `Button`, `Dialog`, `Sheet`,
  `TextField`, `Avatar`, and `Skeleton` are hand-written on the tokens. The
  Radix primitives (Dialog, Label, Avatar) stay for behaviour (focus trap,
  Esc, label association, image fallback). Tailwind v4 stays as the build
  pipeline plus a small `@theme` colour map and a few layout utilities. This
  **retracts "adopt shadcn/ui"** from
  [discussion 0001](../discussions/0001-purpose-and-initial-tech-stack/proposal.md)
  (status 確定); Tailwind v4 and that discussion's "semantic tokens, no
  literal colours in components" rule stand — now expressed through semantic
  CSS classes rather than `cva` utility strings.

- All UI copy is English. User-entered content — group and item names, the
  signed-in user's name — renders in the OS gothic (`--font-ugc`) with no web
  font. The rounded display face used for chrome text (Zen Maru Gothic) is
  self-hosted via `@fontsource`, **Latin subset only** (chrome copy is
  English, so the CJK subset is never needed); no runtime CDN.

- **item-detail gains one write action**, a deliberate exception to
  [0004 item entity CRUD](0004-item-entity-crud.md) where the detail page was
  title + completed volume + edit link only: an optimistic "Add a volume"
  button that `PATCH`es the item with `completedVolume + 1`, rolling the number
  back and showing a fixed inline error on failure (the
  [0005](0005-form-and-fetch-error-feedback.md) `useSubmit` model). Increment
  only; lowering or correcting the volume still goes through Edit.

- The Google-rendered sign-in button keeps its existing options
  ([0004 home and login](../discussions/0004-home-and-login/proposal.md)); it
  is the one control not restyled to the palette.

- Unchanged: routing and page structure, the API, and the form/fetch error
  model ([0005](0005-form-and-fetch-error-feedback.md)). The proposal's
  `home-auth.html` mock has no counterpart — the authenticated home was
  removed by
  [worklog 0008](../worklogs/0008-home-signin-button-lifecycle/plan.md) before
  this landed, and its name / Groups / Log out live in the nav sheet.

## Rationale

The discovery asked for a specific look (mobile-only, light, one column, moss ×
rounded gothic, golden-ratio scales, English) that shadcn/ui's Radix-heavy,
utility-styled component model does not naturally express, so the generated
primitives were dropped rather than re-skinned. Keeping Radix but not shadcn
retains the accessibility behaviour that is expensive to re-implement (focus
trap, Esc, portal) while letting the visuals be written once, plainly, on the
tokens. Self-hosting only the Latin subset follows from the two-font split
(rounded face for English chrome, OS gothic for Japanese user content): the
self-hosted face never renders a CJK glyph, so vendoring that subset would be
dead weight. The item-detail increment is the one place the "detail pages are
read-only" rule from 0004 costs the user a round trip through Edit for the most
common action (marking one more volume read), so it earns a single scoped
exception.
