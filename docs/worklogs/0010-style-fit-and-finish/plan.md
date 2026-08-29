---
date: 2026-08-29
status: merged
discussions: [0021-style-fit-and-finish]
decisions: [0010-style-fit-and-finish]
pr: null
---

# Style fit-and-finish: 9 small adjustments after the moss overhaul

Implementing the nine adjustments in
[0021-style-fit-and-finish proposal](../../discussions/0021-style-fit-and-finish/proposal.md).
These are the fit-and-finish notes taken after worklog 0009 reflected the
0016 moss × rounded-gothic system into `apps/web`. Two of the nine
(font unification, backlink removal) also close open discoveries 0019 and
0020.

Related design: `docs/design/repository-structure.md` `apps/web` section
(two-font split, self-hosted Zen Maru Gothic Latin subset — retracted by
item 1 here); decision 0006 font paragraph (to be amended by `/decide`
after this lands).

## Scope, from the proposal

1. **Font** — collapse `--font` / `--font-ugc` into one OS-gothic stack,
   drop `@fontsource/zen-maru-gothic` and its three `main.tsx` imports,
   delete `.ugc` and every `var(--font-ugc)` override.
2. **`/groups`** — heading + "New group" on one row via `.sectionhead`
   instead of `.pagetitle` + a separate `.toolbar`.
3–4. **Section-head buttons** — a new heading-mini button size (`btn-xs`),
   applied to the `.sectionhead` buttons (group-detail Edit / Add item,
   `/groups` New group), aligned to the heading's cap height.
5·7. **Backlinks** — remove every `.backlink` (`GroupDetailPage`,
   `ItemDetailPage`, group/item new + edit) and the `.backlink` CSS.
6. **`vol. N`** — three-digit fixed-width right-aligned column in the item
   rows, chevron gap tightened.
8. **Wordmark** — header `siorie` becomes a `<Link to="/">`; footer stays
   plain text.
9. **Edit-page delete button** — full-width hairline separator then a
   right-aligned danger button, in both `ItemEditPage` and `GroupEditPage`.

Test churn is expected to be nil: no test asserts on backlinks, the
wordmark, or any copy that changes (none does), and button/​column/​font
changes are outside behaviour tests. (Proposal "付随して必要な変更".)

## Plan

- `apps/web/package.json` / `apps/web/src/main.tsx` — remove the font
  dependency and imports.
- `apps/web/src/index.css` — font token collapse; `.ugc` delete;
  `.btn-xs`; `.input` / `.input::placeholder` / `.row .title` /
  `.nav-sheet-name` font-family overrides removed; `.vol` min-width +
  right align + chevron gap; `.backlink*` removed; `.sectionhead`
  `align-items`; `.wordmark` link styling + focus ring; `.form-danger`.
- `apps/web/src/components/Button.tsx` — `size` gains `'xs'`.
- `apps/web/src/components/layout/AppLayout.tsx` — wordmark `<Link>`.
- `apps/web/src/pages/groups/GroupsListPage.tsx` — `.sectionhead` head.
- `apps/web/src/pages/groups/GroupDetailPage.tsx` — drop backlink,
  `size="xs"` on both section-head buttons.
- `apps/web/src/pages/groups/items/ItemDetailPage.tsx` — drop backlink,
  `size="xs"` on Edit (see difficulty note).
- `apps/web/src/pages/groups/{GroupNewPage,GroupEditPage}.tsx` +
  `.../items/{ItemNewPage,ItemEditPage}.tsx` — drop backlink and the now
  unused `Link` / `ArrowLeft` imports; edit pages get `.form-danger`.
- Verify: `pnpm --dir apps/web format:check` / `lint` / `test` / `build`,
  then root `just check`.

## Work log

### 1. Font — one OS-gothic family

- `pnpm --dir apps/web remove @fontsource/zen-maru-gothic` — dropped from
  `package.json` and `pnpm-lock.yaml` (8 lock lines). `main.tsx` lost the
  three `import '@fontsource/zen-maru-gothic/latin-{400,500,700}.css'` lines
  and their comment.
- `index.css`: `--font` now holds the old `--font-ugc` stack
  (`ui-rounded, 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic',
  'Yu Gothic UI', Meiryo, system-ui, sans-serif`); `--font-ugc` token
  deleted; the `@layer base` `.ugc` rule deleted.
- Every other `var(--font-ugc)` consumer had its override removed so it
  inherits `--font` from `body`: `.input`, `.input::placeholder`,
  `.row .title`, `.nav-sheet-name` (see difficulty 1 — the proposal only
  enumerated the `className="ugc"` sites).
- `className="ugc"` removed from the two detail-page h1s
  (`GroupDetailPage`, `ItemDetailPage`). `TextField.tsx`'s header comment,
  which described the label/value two-font split, was rewritten.
- Build output: the three `zen-maru-gothic-latin-*.woff2` (~11.5 KB each)
  are gone from `dist/assets/`; `index.css` 16.7 KB → 16.0 KB.

### 2–4. Section heads + heading-mini button

- New `.btn-xs` (`padding: 0 var(--space-2)`, `font-size: var(--fs-xs)`,
  15px icon) and `size="xs"` on `Button` (`size` is now
  `'default' | 'sm' | 'xs'`). `min-height` shipped at 28px, revised to
  26px in pass 2 (difficulty 2).
- `.sectionhead` `align-items: flex-start` → `center`, revised to
  `baseline` in pass 2 (difficulty 2).
- `GroupsListPage`: the `.pagetitle` + separate `.toolbar` pair became a
  single `.sectionhead` (`<h1>Groups</h1>` + `size="xs"` New group). The
  zero-groups branch already returns `<EmptyState>` before this markup, so
  the head button only ever renders when the list is non-empty — matches
  the proposal's "no head button at 0 groups" without extra logic.
- `GroupDetailPage`: both heads' buttons `size="sm"` → `size="xs"`
  (group-name + Edit, Items + Add item).
- `ItemDetailPage`: Edit button `size="sm"` → `size="xs"` as well
  (difficulty 4 — beyond the proposal's enumerated list, for cross-page
  consistency).
- `.pagetitle` stays (still used by the four new/edit heads); `.toolbar`
  stays (form submit rows, item-detail "Add a volume").

### 5·7. Backlinks removed

- `<Link className="backlink">` deleted from `GroupDetailPage`,
  `ItemDetailPage`, `GroupNewPage`, `GroupEditPage`, `ItemNewPage`,
  `ItemEditPage`. `.backlink` / `.backlink svg` / `.backlink:hover` deleted
  from `index.css`.
- `ArrowLeft` dropped from every one of those files' `lucide-react`
  imports; `Link` dropped from the four form pages' `react-router-dom`
  imports (the two detail pages keep `Link` for the Edit link / row links).

### 6. `vol.` column

- `.vol` gains `min-width: 3.25em` + `text-align: right`; with the existing
  `font-variant-numeric: tabular-nums` the ones digit lines up down the
  list (`8` / `13` / `100` flush right). New rule
  `.row .vol + .chev { margin-left: calc(var(--space-2) * -1) }` pulls the
  chevron in from the row's default `--space-3` gap. See difficulty 5 for
  what "right-aligned" does and does not cover.

### 8. Wordmark link

- `AppLayout` header `<span className="wordmark">` → `<Link to="/"
  className="wordmark">`; `Link` added to the import. `.wordmark` gains
  `color: inherit` + `text-decoration: none`, and a `:focus-visible` rule
  matching `.btn` / `.avatar-btn` (`box-shadow: 0 0 0 3px var(--ring)` +
  `border-radius: var(--radius-sm)`). Footer `<footer className="app-footer">`
  stays plain text.

### 9. Edit-page delete button

- `ItemEditPage` and `GroupEditPage`: the trailing
  `<Button variant="danger" className="self-start">` is now wrapped in
  `<div className="form-danger">`. `.form-danger`
  (`display: flex; justify-content: flex-end; border-top: 1px solid
  var(--border); padding-top: var(--space-4)`) draws the full-width hairline
  and right-aligns the button. The `.form` `gap: var(--space-4)` supplies
  the space above the rule, `padding-top` the space below it. The button
  keeps its default 44px size (proposal item 9 is placement-only) and its
  `DeleteConfirmDialog` wiring is untouched. `self-start` is no longer used
  anywhere.

### Verification

- Static visual check: served `apps/web/dist/` CSS into a hand-built HTML
  harness (every touched structure — section heads with single-line,
  CJK, and wrapping headings, both list zero-states, item rows, the danger
  zone, the header) and screenshotted it, since the live app needs Google
  auth.
- Pass-2 head alignment was tuned by measurement, not eyeballing: canvas
  `measureText` in the harness for the live fallback font's ink metrics,
  plus per-variant `getBoundingClientRect` deltas of button vs. heading
  ink. `align-items: baseline` + `btn-xs` 26px lands ±2px for the h1
  heads (Latin and CJK), first-line-pinned for the wrapped heading,
  centred-but-chunky for the `Items` h2 (difficulty 2).
- `just check` (run after each pass): API `go vet` + `go build` pass; web
  `format:check` clean, `lint` 0 errors / 1 pre-existing warning
  (`use-fetch.ts:40`, worklog 0007), `test` 14 files / 52 tests pass
  (unchanged — no test needed a retarget, as the proposal predicted),
  `build` (tsc + vite) passes.

## Result

`apps/web` now runs one OS-gothic `--font` for everything (no web font
bundled — the three Zen Maru Gothic `.woff2` and the `@fontsource`
dependency are gone), `--font-ugc` / `.ugc` deleted. The `/groups` title
and every `.sectionhead` action button use a new `btn-xs` heading-mini
size, baseline-aligned to the heading (see difficulty 2 — shipped
`center` + 28px, revised to `baseline` + 26px after user feedback). All
six backlinks and `.backlink` are gone; the only in-app "up" affordances
are the browser back button and the header wordmark, which is now a
`<Link to="/">`. Item rows carry a
three-digit right-aligned `vol.` column with the chevron pulled in.
Both edit pages end with a full-width hairline and a right-aligned delete
button.

Web module: 1 dependency removed (`@fontsource/zen-maru-gothic`), no
additions. `index.css`, `main.tsx`, `Button.tsx`, `TextField.tsx`,
`AppLayout.tsx`, and all six group/item detail + new + edit pages touched.
0 test files changed; 52 tests green.

Not done here (belongs to `/decide`, per the flow): amending decision 0006's
font paragraph (two-font split → one family), closing discoveries 0019 and
0020, and updating `design/repository-structure.md` `apps/web` (the two-font
/ self-hosted-Latin-subset sentences). The proposal flags all of these as
post-merge.

## Difficulties

1. **The font collapse touched four `var(--font-ugc)` sites the proposal's
   list did not name.** Proposal item 1 enumerates the `className="ugc"`
   occurrences (two detail-page h1s, plus "nav sheet user name" — which is
   actually `.nav-sheet-name`, not a `.ugc` node). But `--font-ugc` was
   also the declared family on `.input`, `.input::placeholder`,
   `.row .title`, and `.nav-sheet-name` — user-content surfaces that set the
   font through their own component class, never through `.ugc`. All four
   overrides had to be removed too (they now inherit `--font` from `body`,
   which is the intended end state). Following the proposal's bullet
   literally — delete `.ugc`, strip `className="ugc"` — would have left
   inputs and list titles still pointing at a deleted token. Not a design
   fault; the proposal described the JSX churn, not the full set of CSS
   consumers. A `grep 'font-ugc'` was the reliable way to find them, not the
   proposal text.

2. **Aligning the head button to the heading took two passes;
   `align-items: center` looks right by the box but wrong to the eye.**
   First pass shipped `.sectionhead { align-items: center }` +
   `.btn-xs { min-height: 28px }`. It centres the button's border box on
   the heading's *line box*, and the static harness confirmed the centres
   matched to 0.1px — but the user flagged `/groups`' `Groups` + `New
   group` as visibly not lined up. In-browser measurement (canvas
   `measureText` for the live fallback font: `actualBoundingBoxAscent` 19,
   `actualBoundingBoxDescent` 7 for "Groups" at `--fs-lg`;
   `fontBoundingBox` 28 / 8) showed why: the font's em box is
   ~36px tall while the ink is ~26px, with ~9px of empty space above the
   caps and ~1px below the baseline. Centring on the em box therefore drops
   the button ~4px below the ink's optical centre — and because Latin
   heading text is top-weighted (caps + x-height, one short descender), the
   eye reads that as the button sitting low. Fix: `align-items: baseline`
   + `.btn-xs { min-height: 26px }` (≈ the h1 ink height). Baseline
   alignment tracks the button's cap and foot to the heading's
   (measured ±1.9px for `Groups`, +1.1 / +2.1 for a CJK h1), and as a
   bonus it pins the button to the *first* line of a wrapped heading
   instead of floating it to the vertical middle of the block — so the
   long-group-name case that `center` degraded is now fine without a
   `.oneline`-style guard. Residual: against the short word `Items` (h2,
   ink only ~16px) the 26px button is centred (−0.5px) but overhangs ~5px
   top and bottom — chunky, not misaligned; not worth `:has()`
   special-casing a head nobody flagged.

3. **`btn-xs` height came from the measured h1 ink, not the proposal's
   guess.** The proposal floated "h1 ~30px, h2 ~26px" (two heights) while
   fixing the tier count at three (default / sm / xs). The first pass used
   28px; after the pass-2 measurement (cap-ascent 19 + descent 7 = 26 for
   an `--fs-lg` head) it dropped to **26px** — one height, matched to the
   h1 ink and baseline-aligned, which is close enough for the CJK h1 and
   the h2 too (difficulty 2). The proposal's "実測で詰める" needed an actual
   font-metric read, not eyeballing a screenshot.

4. **item-detail's Edit button was pulled into `size="xs"` although item
   3–4 did not list it.** The discovery enumerates the `/groups/:groupId`
   heads and `/groups`; it never names `/groups/:groupId/items/:itemId`.
   But that page renders the same `.sectionhead` class with an Edit button,
   the `align-items` change hits it either way, and leaving its Edit
   at `sm` (36px) beside group-detail's `xs` (26px) Edit would put back the
   exact cross-page button-size mismatch 0021 is cleaning up. Changed it;
   this is a deliberate step past the written list, one line to revert if
   the omission was intentional.

5. **`vol.` "right-aligned" aligns the digits' right edge, not the `vol.`
   label.** `min-width: 3.25em` + `text-align: right` on `.vol` right-flushes
   the whole `vol. N` string, so the ones digit lines up down the list
   (`8`, `13`, `100`). The `vol.` prefix, inline before the number, then
   slides left as the number grows — it is not itself column-aligned across
   rows. This matches the discovery ("`vol. 3` をより右に", "3桁表示できれば
   良い") and the minutes ("三桁固定幅の右揃えカラム"), but a stricter reading
   where `vol.` also forms a column would only look identical when every row
   has the same digit count. `3.25em` is an eyeballed fit for `vol.` (10px)
   + three tabular digits (16px bold); four+ digits overflow, as the
   proposal allows.

## Structural note

Difficulty 2 pointed at what looked like a recurring tension — a
`.sectionhead` puts a fixed-size button next to arbitrary-length user-text
headings in a ≤430px column — but `align-items: baseline` turned out to
resolve both halves of it: the single-line heads align to ±2px, and a
wrapped heading keeps the button on its first line for free (the baseline
of a multi-line block is its first line's). So the `.oneline` clip that
worklog 0009 difficulty 5 added for item-detail's title is not needed on
the group-name head after all. What survives is minor and not
discovery-shaped: the one `btn-xs` height (26px, set from the h1 ink)
overhangs the much shorter `Items` h2 word, centred but chunky. If that
ever matters, a smaller button scoped to `.sectionhead:has(h2)` is the
lever — noted, not done.

## Deviations vs. proposal — summary

- Removed `var(--font-ugc)` from `.input` / `.input::placeholder` /
  `.row .title` / `.nav-sheet-name` — consumers the proposal's item-1
  bullet did not list (difficulty 1).
- `.sectionhead` set to `align-items: baseline` (not `center`) after a
  measured second pass on user feedback; `btn-xs` is one 26px height set
  from the h1 ink, not the proposal's floated per-level ~30/~26px
  (difficulties 2, 3).
- item-detail's Edit button also moved to `size="xs"`, beyond item 3–4's
  enumerated list (difficulty 4).
- Both list zero-states now keep the head create button and drop the empty
  card's CTA — two follow-up requests that invert 0009 difficulty 6 /
  0021 item 2's parenthetical (see Follow-up section, difficulty 6).
- Everything else — font stack value, backlink removal set, `.form-danger`
  hairline + right-aligned default-size delete button, wordmark `<Link>`
  with an inherited colour and a matching focus ring, `vol.` three-digit
  right-aligned column with a tightened chevron gap, zero test churn —
  matches the proposal.

## Follow-up: list zero-states keep the head button, lose the card CTA

Two consecutive user requests in the same session, after the nine items
above landed. Together they change one thing on both list screens: the
create action lives only in the `.sectionhead`, never in the empty card.

1. `/groups/:groupId` — keep `+ Add item` beside the `Items` heading even
   when the group has no items; drop the `+ Add item` CTA from the "No
   items yet." card.
2. `/groups` — same shape: keep `Groups` + `+ New group` in the head at
   zero groups; drop the `+ New group` CTA from the "No groups yet." card.

Changes:

- `EmptyState`: `ctaLabel` / `ctaTo` are now optional; the `<Button>`
  renders only when both are given.
- `GroupDetailPage`: the `hasItems` guard on the head button is gone (and
  the variable with it) — the `.sectionhead` `<Button size="xs">` renders
  unconditionally. It only needs `group.data.id`, resolved past the group
  guards, so it is stable through the items fetch's loading / error /
  empty / list states with no layout shift. The items `<EmptyState>` is
  now `icon={BookOpen}` + `message` only.
- `GroupsListPage`: the `groups.data.length === 0` early `return` of a
  bare `<EmptyState>` is gone. The `.sectionhead` (title + `size="xs"`
  New group) now renders for the whole settled state, and the body below
  it is `groups.data.length === 0 ? <EmptyState message="No groups yet." />
  : <ul>`. This also completes item 2's restructure — the page had kept a
  `.pagetitle` + separate `.toolbar` on the non-empty path only until now.
- Tests: still 52 green, no test file touched.
  `GroupDetailPage.test.tsx` and `GroupsListPage.test.tsx` each assert, on
  the empty path, `getByRole('link', { name: <create label> })` with the
  new-page href plus `getByText(<empty message>)`. Both still hold: the
  head button carries the same label and href the removed card CTA did,
  and it is still exactly one such link on the page. (`GroupsListPage`'s
  case is titled "…with a create CTA" — still accurate, the CTA just moved
  into the head.)
- Verified in the static harness: both screens show `<title> + create
  button` head above a buttonless empty card.

### Difficulty (follow-up)

6. **This reverses worklog 0009 difficulty 6 and rewrites the assumption
   proposal 0021 item 2 was built on — but lands symmetric.** Worklog 0009
   deliberately hid the group-detail head "Add item" while the list was
   empty, so the empty screen carried one CTA (the card's), not two
   stacked buttons. Proposal 0021 item 2 then reused that decision by
   analogy — its parenthetical sets `/groups`' zero-state to have no head
   button, "group-detail の「Add item」と同じ扱い＝ worklog 0009 difficulty
   6". The two user requests here invert *both* sides in the same
   direction: head button always present, card CTA always absent, on both
   list screens. So the end state is still internally consistent — the
   "one create affordance, in the head" rule now holds uniformly — it is
   just the opposite of the "one create affordance, in the card" rule that
   0009 and 0021 assumed. The `EmptyState` CTA prop is now dead code for
   every current caller; it is kept optional rather than removed in case a
   future empty screen has no header to host the action. Whether the
   "create action never in the empty card" rule should be written down
   (superseding 0009 difficulty 6 / 0021 item 2's parenthetical) is a
   `/decide` question.
