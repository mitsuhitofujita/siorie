---
name: discuss
description: Discuss from discovery.md, and once we agree, write up proposal.md
argument-hint: <path under docs/discussions/ (e.g. docs/discussions/0010-item-groups), or the sequence number alone (e.g. 0022)>
disable-model-invocation: true
---

Follow `docs/README.md`.

`$1` points to the target discussion. It is one of:

- A path relative to the repository root — a directory under `docs/discussions/`,
  or any file inside one. If a file is given, target its containing directory.
- A bare sequence number, e.g. `22` or `0022`. Zero-pad it to four digits and
  target the entry under `docs/discussions/` whose name is exactly that number
  (`0022`) or begins with `0022-`. If nothing matches, or more than one does,
  stop and ask me.

Target: `$1`

## 1. Read

Read `discovery.md` first. If it has no frontmatter, infer it from the content and fill it in.

If the directory name is still the sequence number alone (e.g. `0011`), come up
with a short description from the `discovery.md` content and rename the directory
to `NNNN-short-description`. Work against the renamed path from then on.
If it already has a short description, leave it as is.

Next, check the related `docs/design/` and `docs/decisions/`, and any past
`docs/discussions/` whose frontmatter tags overlap.

If the same option was considered and set aside before, tell me that first.

## 2. Discuss

Do not write `proposal.md` or `minutes.md` at this stage.

Ask about the places where what I wrote lacks context.
If there are options I did not raise, put them forward.
If an assumption of mine looks shaky, say so. Do not favour agreement.

At most three questions at a time.
If my answer is vague, ask again instead of moving on.

Keep the discussion going until I tell you to write up the proposal.

## 3. Write up

Once we agree, create the following.

`minutes.md`, in Japanese. Key points only, not verbatim. Be sure to keep a
record of what you asked, and of the options that were considered and not taken,
with the reasons why.

`proposal.md`, in Japanese. Write the thinking as it stands at proposal time.
It is not a decision.

Change the `status` in the `discovery.md` frontmatter to `proposed`.
Never change the body.
