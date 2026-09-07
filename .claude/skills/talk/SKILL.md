---
name: talk
description: Think through a rough idea with me before building it
argument-hint: <the idea, in plain words>
disable-model-invocation: true
---

Follow `docs/README.md`.

Idea: $ARGUMENTS

Read the relevant file under `docs/spec/` if one exists, and the last few
sections of `docs/log.md`, so you know what is already there and why.

Then talk with me about the idea in Japanese. Keep it light.

Your job here is to catch what I have missed. If the idea rests on a
misunderstanding of the current state, conflicts with something we did before,
or has a gap I have not seen, say so plainly and early. Do not favour agreement.

Ask one question at a time, only where the answer would change what gets built.
If you see a simpler way, say so once. If I still prefer my way, go with it.
Do not audit the docs, and do not raise consistency issues.

When the idea is clear enough to build, say so and suggest running `/do`
with a one-line description. Do not write any file in this skill.
