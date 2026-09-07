---
name: do
description: Implement what I ask, then note what changed in docs/log.md and update docs/spec/
argument-hint: <what to do, in plain words; an issue number is welcome>
disable-model-invocation: true
---

Follow `docs/README.md`.

Task: $ARGUMENTS

## Before

Skim the relevant file under `docs/spec/` and the last few sections of
`docs/log.md`, so you know the current state and how we got here.

Then question the task itself, once. I am not always right. If you see a
mistake, a misunderstanding of the current state, or something I clearly
have not considered that would change what gets built, say it in a few
sentences and wait for my answer. At most two points; the biggest ones.

If nothing rises to that level, start. Do not ask for permission,
and do not list minor doubts.

## Implement

Just build it. Keep changes small and working.

Do not stop to point out inconsistencies between docs, or between docs and code.
If you notice one and can fix it in a minute, fix it silently.
If you cannot, write one line about it in `docs/log.md` and carry on.

If you discover mid-way that the task cannot work as asked, stop and tell me
what you found, rather than building around it.

## After

Append one new section at the end of `docs/log.md`, in English.
The heading is a short title, today's date, and the issue number if I gave one,
e.g. `## Item groups (2026-09-06, #12)`.
Under it, a few lines: what changed, and, if a choice was made, the reason in
one sentence. One task, one section; never merge into an earlier one.

Update or create the relevant file in `docs/spec/`, in English, so it describes
how things work now. Overwrite old text; keep only the current state.

Then tell me, in a few sentences, what you did and where I can look.
Do not list difficulties, lessons, or suggestions unless I ask.
