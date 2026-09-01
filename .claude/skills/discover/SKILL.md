---
name: discover
description: Add a new discussion — create the next numbered docs/discussions/ directory with a stub discovery.md
argument-hint: <a very short title>
disable-model-invocation: true
---

Follow `docs/README.md`.

`$ARGUMENTS` is a very short title for something worth discussing later.
If none is given, ask me for one.

## Create the stub

Take the highest `NNNN` prefix among the existing `docs/discussions/` entries, add
one, and zero-pad it to four digits. Create the directory with that number alone —
`docs/discussions/<NNNN>/`, not a `NNNN-title` name. `/discuss` renames it to
`NNNN-short-description` when it later reads the content.

Before writing, skim `docs/design/` for the current-state documents the title
touches, so the guess is anchored to how things actually stand. If one of those
documents points to a decision that looks directly relevant, read that
`docs/decisions/NNNN-*.md` too — otherwise leave `docs/decisions/` alone.

Write `docs/discussions/<NNNN>/discovery.md` in Japanese, with no frontmatter:

- The title as given, verbatim, on the first line.
- Then one to three loose lines guessing what this might be about, read against
  the title and whatever `docs/design/` (plus any decision you followed) shows.
  Getting it wrong is fine — this is a placeholder for me to rewrite.

Keep it tiny. Do not read the application code, do not add frontmatter, do not add
tags, do not start the discussion — that is `/discuss`'s job.

Then tell me the path you created.
