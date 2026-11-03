---
name: commit
description: Create git commits for changed files following Conventional Commits specification, splitting unrelated changes into multiple meaningful commits.
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(ls *) Bash(rg *) Read Write Edit
---

# Git Commit with Conventional Commits

## Instructions

1. Run `git status` to see all staged, unstaged, and untracked files. If there are no changes at all, inform the user and stop.
2. Run `git diff` and `git diff --staged` to read the actual content of every change (including already-staged changes).
3. Run `git log --oneline -5` and `git show --stat` on the last few commits to learn the repository's convention: its type/scope vocabulary (e.g. `docs(spec)`, `test(api)`) and whether doc/work-log files such as `docs/log.md` travel with the code or land in their own `docs(...)` commit. `--oneline` alone does not show grouping — read the file lists. Follow the local convention when grouping in step 4.
4. Group the changed files into logically separate, meaningful units (e.g. by feature, module, or purpose). Do not lump unrelated changes into a single commit, and do not split a single coherent change across multiple commits.
   - A file that was already modified before this session started (it appeared as modified in the first `git status`) is not part of the task: give it its own commit with its own message rather than sweeping it into a task group.
   - One file can hold two unrelated changes (e.g. a source fix and a rebuilt-bundle asset hash). Split the file across the two commits instead of lumping them — see "Splitting one file across commits".
5. For each group, in order:
   - Stage only the files belonging to that group with `git add <specific paths>` (never `git add -A` or `git add .`, to avoid accidentally including unrelated or sensitive files).
   - Before committing, check the files staged in this group aren't sensitive (e.g. `.env`, credentials) — warn the user and skip that file if so.
   - Generate a commit message for that group following the rules below.
   - Execute `git commit` with the generated message.
6. After all groups are committed, run `git log --oneline -N` (N = number of commits created) and `git status` to confirm everything was committed successfully.

## Splitting one file across commits

`git add -p` is interactive and unusable from a non-interactive shell. To stage
only one hunk of a file:

1. Rewrite the other change back to its committed value in the working tree
   (an editor patch, not `git checkout`, so the intended change survives).
2. `git add <file>` — the index now holds the intended hunk plus the committed
   value of the other change.
3. Rewrite the other change into the working tree again; it is now unstaged and
   stays out of this commit.
4. `git commit` (never `git commit -a`, which would pull the unstaged change
   back in), then `git add <file>` again for the second group.

Check `git diff --staged <file>` before each commit: it must show only that
group's hunk.

## Commit Message Rules

### Format (Conventional Commits)

```
<type>[optional scope]: <description>

[optional body]
```

### Types

- `feat`: a new feature
- `fix`: a bug fix
- `docs`: documentation only changes
- `style`: changes that do not affect the meaning of the code (formatting, etc.)
- `refactor`: a code change that neither fixes a bug nor adds a feature
- `perf`: a code change that improves performance
- `test`: adding missing tests or correcting existing tests
- `build`: changes that affect the build system or external dependencies
- `ci`: changes to CI configuration files and scripts
- `chore`: other changes that don't modify src or test files

### Rules

- Write commit messages in **English**
- The `description` must start with a **lowercase** letter
- The `description` must **not** end with a period
- The `description` describes **what was done** (concise, imperative mood)
- The `body` describes **why it was done** (include whenever possible)
- Separate subject from body with a blank line
- Wrap body at 72 characters

### Examples

```
feat(auth): add OAuth2 login support

Users needed a way to sign in with third-party providers without
creating a new account, improving onboarding experience.
```

```
fix: resolve null pointer exception on empty input

The previous implementation did not handle the case where the input
was empty, causing crashes in production.
```

## Execution

For each group, stage its files explicitly, then pass each commit-message
paragraph directly with a separate `-m` option:

```bash
git add <path1> <path2> ...
git commit -m "<type>[optional scope]: <description>" -m "<optional body>"
```

Do not use shell substitution such as `$(...)`, a heredoc, or a here-string when
running `git commit`. For a subject-only message, use one `-m`; for a message
with multiple paragraphs, use one `-m` per paragraph. This keeps the invocation
compatible with the repository's permission rule for `git commit -m`.

Repeat for every group. After the last commit, show the result of `git log --oneline -N` (N = number of commits created) to confirm all commits were created successfully.
