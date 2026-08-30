---
name: work
description: Start a worklog from proposal.md, implement it, and append the outcome and the difficulties
argument-hint: <path under docs/discussions/ (e.g. docs/discussions/0010-item-groups), the sequence number alone (e.g. 0010), or a description of the work>
disable-model-invocation: true
---

Follow `docs/README.md`.

Target: $ARGUMENTS

## 1. Identify the starting point

Work out what `$ARGUMENTS` is:

- A bare sequence number, e.g. `10` or `0010` — zero-pad it to four digits and
  take the entry under `docs/discussions/` whose name is exactly that number
  (`0010`) or begins with `0010-`, then read its `proposal.md`. If nothing
  matches, or more than one does, stop and ask me.
- A path relative to the repository root under `docs/discussions/` (a directory,
  or any file inside one) — read its `proposal.md`.
- Anything else — treat it as a description of the work. That is fine for a small
  task with no proposal; do not try to make me write a discovery.

Before you start implementing, check the related `docs/design/`.

## 2. Create the worklog

Create `docs/worklogs/<NNNN-short-description>/plan.md`.
`NNNN` is the next four-digit sequence number after the existing worklogs (in the
order the directories were created, same as `discussions/` and `decisions/`).
Write the short description in English kebab-case, following the existing worklogs.

Use this frontmatter. For `date`, use today's date, not the proposal's date.

```yaml
---
date: <today's date>
status: in-progress
discussions: []
decisions: []
pr: null
---
```

Add a link to this worklog to the corresponding `discovery.md` frontmatter too.
Always make links bidirectional.

## 3. Implement

Write the body in English.

Add to `plan.md` as you go. Do not write it all up after the fact.
If anything differs from what the proposal assumed, record it right then.

## 4. When done

Append what you did and what difficulties came up, in English.
The worklog is material an agent reads back later, so keep the difficulties
section free of Japanese too.

Treat the points that differed from expectations as the most valuable content.
Write them up in more detail than the parts that went well.

Do not write anything back into `proposal.md`. The gaps go on the worklog side.

## 5. Review the difficulties

If any of the recorded difficulties look like a distortion in the design or the
assumptions rather than a one-off accident, point them out. Ask me whether a new
`discovery.md` should be written.

Do not create a discovery on your own. Writing it is my job.
