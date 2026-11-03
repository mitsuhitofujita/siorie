---
name: build
description: Implement what I ask, then note what changed in docs/log.md and update docs/spec/
argument-hint: <what to do, in plain words; an issue number is welcome>
disable-model-invocation: true
---

Follow `docs/README.md`.

Task: $ARGUMENTS

## Before

Skim the relevant file under `docs/spec/` and the last few sections of
`docs/log.md`, so you know the current state and how we got here.
Read relevant notes under `docs/intent/` as background when present. They may
be uncertain, incomplete, wrong, or contradictory. The current request defines
the task; the notes alone do not authorize implementing everything in them.

Then question the task itself, once. I am not always right. If you see a
mistake, a misunderstanding of the current state, or something I clearly
have not considered that would change what gets built, say it in a few
sentences and wait for my answer. At most two points; the biggest ones.

If nothing rises to that level, start. Do not ask for permission,
and do not list minor doubts.

## Implement

Just build it. Keep changes small and working.

A request to design and present something (a table design, an API shape) is not
an implementation: change nothing in the repository, verify the proposal in a
scratch copy (the Drizzle reference has the schema recipe), and present it in the
chat. Generating the migration and updating `docs/spec/` belong to the session
that implements it.

When overwriting an existing file, read it with `read_file` first in the same
session — a truncated read, or one done through the terminal, does not count.
If the write is refused as stale, `rm` the file and write it fresh rather than
retrying the same call.

Do not stop to point out inconsistencies between docs, or between docs and code.
If you notice one and can fix it in a minute, fix it silently.
If you cannot, write one line about it in `docs/log.md` and carry on.
This cleanup rule does not apply to `docs/intent/`: preserve rough notes unless
I ask to edit them, and do not log their uncertainty or contradictions as defects.

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
A change that does not alter behavior (test-only fixes, internal refactors) needs
no spec edit: leave `docs/spec/` alone rather than rewriting it for churn.

When creating more than one spec file in a session, check each file's language
against the `docs/README.md` rule before finishing — it is easy to write one in
the wrong language when juggling several at once.

Then tell me, in a few sentences in Japanese, what you did and where I can look.
Write the whole reply in Japanese — the docs are English, the chat is Japanese —
and do not mix in another language.
Do not list difficulties, lessons, or suggestions unless I ask.

## References

- [Drizzle ORM + Cloudflare D1](references/drizzle-d1.md) — Drizzle ORM / Drizzle Kit を D1 で使うときの設定、スキーマ定義、SQLite の DEFAULT 括弧要件、migration、確認手順。
