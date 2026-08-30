---
name: decide
description: Record a worklog into decisions and reflect the current state in design
argument-hint: <path under docs/worklogs/ (e.g. docs/worklogs/0004-item-groups-crud), or the sequence number alone (e.g. 0004)>
disable-model-invocation: true
---

Follow `docs/README.md`.

`$1` points to the target worklog. It is one of:

- A path relative to the repository root — a directory under `docs/worklogs/`,
  or any file inside one. If a file is given, target its containing directory.
- A bare sequence number, e.g. `4` or `0004`. Zero-pad it to four digits and
  target the entry under `docs/worklogs/` whose name is exactly that number
  (`0004`) or begins with `0004-`. If nothing matches, or more than one does,
  stop and ask me.

Target: `$1`

## 1. Check

Read the worklog's `plan.md`.
If it started from a `docs/discussions/` entry, read that entry's `proposal.md` and `minutes.md` too.

We are early in development and commit straight to `main` without going through
pull requests or merges, so there is nothing to wait for. `/decide` being called
is what triggers the write-up.

## 2. Write the decision

Create `docs/decisions/NNNN-short-title.md` in English.
`NNNN` is the next sequence number after the existing files.

Summarise it down to the decision and its reasoning.
The path that led there is in discussions and the actual implementation is in the
worklog, so do not repeat them here. Do not move the proposal over as is. Short is fine.

At the top, link to the corresponding discussions and worklog.

If the judgement overturns a past decision, add a new decision, then change the
old one's status and cross-link the two. Do not rewrite the body of the old decision.

## 3. Update design

If this change moved the current state, rewrite the relevant `docs/design/` in English.
You may overwrite the old text; design holds the current state only.

At the end of each document, add a link to the decision you just wrote.

If the current state has not changed, do not touch design.

## 4. Align the statuses

Add a link to the decision you just wrote to the worklog's frontmatter `decisions`.
Set the worklog's status to `merged`.
Set the originating `discovery.md`'s status to `decided`. Do not change its body.

## 5. Finally

If any of the difficulties recorded in the worklog have not become a discovery
yet, point them out. Running `/decide` does not mean the distortions noticed
there are resolved.
