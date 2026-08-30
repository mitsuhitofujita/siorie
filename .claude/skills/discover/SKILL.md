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

Write `docs/discussions/<NNNN>/discovery.md` in Japanese, with no frontmatter:

- The title as given, verbatim, on the first line.
- Then one to three loose lines guessing what this might be about, inferred from
  the title alone. Getting it wrong is fine — this is a placeholder for me to
  rewrite, so mark it plainly as a guess (e.g. lead with `（推測）`).

Keep it tiny. Do not read the codebase, do not add frontmatter, do not add tags,
do not start the discussion — that is `/discuss`'s job.

Then tell me the path you created.
