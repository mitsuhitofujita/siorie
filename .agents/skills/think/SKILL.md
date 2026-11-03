---
name: think
description: Think through a rough idea with me before building it
argument-hint: <the idea, in plain words>
disable-model-invocation: true
---

Follow `docs/README.md`.

Idea: $ARGUMENTS

Read the relevant file under `docs/spec/` if one exists, and the last few
sections of `docs/log.md`, so you know what is already there and why.
Read relevant notes under `docs/intent/` as background when present. They may
be uncertain, incomplete, wrong, or contradictory; do not treat them as
settled requirements or tidy them up just for consistency.

Ground the idea in the code too, not only the docs: for every file, table or
route it touches, confirm the current state yourself with `search_files` and
reads. Docs lag behind the code — the snapshot in `docs/prompts/README.md`
included — and a question built on a stale fact wastes a turn. Skim the
newest related prompts under `docs/prompts/` as well, especially their
「スコープ外」 lists: items deferred there are decisions already taken
(「次のタスク」 notes), so an idea that collides with one is a conflict with
something done before — raise it early.

For an idea about layout (width, column count, row count, spacing), reading
the CSS is not grounding: render the built SPA and measure it. A `max-width`
on the page container does not prove the rendered width — an ancestor can
shrink-wrap the whole chain (an unstyled `#root` under a centered flex body
shrinks to its content), and the rendered width changes with the data (an
empty list is narrower than a populated one). Measure `#root`, the page
container and the grid at several viewport widths, with both empty and
non-empty data, before writing assumptions or a 現状 line. The measurement
recipe is in the `implementation-prompts` skill.

For an idea that introduces a tool (linter, formatter, test runner), reading
configs is not grounding either: run each candidate against the real sources in
a scratch directory and put the actual finding count in the question (`pnpm
dlx` runs a package with no install). Then check what making the first run clean
touches: a fix in frontend source changes the built bundle, so the committed
assets and any hardcoded `index.html` hashes belong to the task, not to an
afterthought. The probe recipe is in the `implementation-prompts` skill.

For a column-count or width idea on a wide single-column page, measure the
resulting column width before talking: the literal reading can be absurd (two
equal columns across a 1280px page is 605px per row), so make the width bound
the question, with the measured px of each option — split the full width, cap
the block (e.g. `max-width: 24rem`), or content-width columns — and say what
each implies: only a fixed-width column truncates a long label, so the
「途切れてよい」 instruction is evidence the columns are fixed, not a licence to
leave the width open.

Then talk with me about the idea in Japanese. Keep it light.

Your job here is to catch what I have missed. If the idea rests on a
misunderstanding of the current state, conflicts with something we did before,
or has a gap I have not seen, say so plainly and early. Do not favour agreement.

When the idea widens or shifts what a view shows (前月/翌月, pagination, filters),
resolve the state that outlives the range before anything else: a selected item
can fall outside the new view while other controls still act on it, and data
loaded once for the fixed range has to be refetched per range. Keep the retained
data bounded to the displayed range plus the selected item's range — not every
range visited — and keep enough rows for the selected item that the controls can
show its state and choose the right action; keeping only its key is not enough.
Check whether the existing route already takes that range as a parameter — the
change may be client-only. If the proposal is to move an add/remove decision
into an API toggle to avoid client state, check idempotence and whether the
response really removes that need (the controls still need the selected range's
data before the first tap); idempotent attach/detach endpoints are the safer
contract. These are the usual hidden forks; fold them into the one question
and the assumptions.

Ask one question at a time, only where the answer would change what gets built.
When you raise a fork, give the concrete choices and what each implies
(schema change or not, who may edit, ...) so I can answer briefly.
When something in the idea looks like a slip (the same property stated twice
with different values, a value that contradicts the sentence around it), ask
about it instead of silently picking a reading — a guess made here gets baked
into the prompt. Put the rest of your reading in the same message as a short
list of assumptions (what stays, what is out of scope), so one reply settles
several unknowns — the same message, not the final report after the answer;
landing them late costs an extra round trip and leaves the prompt with
unconfirmed choices.
If you see a simpler way, say so once. If I still prefer my way, go with it.
Do not audit the docs, and do not raise consistency issues.

When the idea is clear enough, write it up as a self-contained implementation
prompt in a file under `docs/prompts/`, following `docs/prompts/README.md`
(load the `implementation-prompts` skill for the authoring steps and pitfalls),
and finish. Do not suggest running `/build`. By default, do not write any other
files. If I ask you to save my intent, write it under `docs/intent/` following
`docs/README.md`; preserve unresolved points and keep your own inferences
separate from my intent.
