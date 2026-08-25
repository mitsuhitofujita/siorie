---
date: 2026-08-23
tags: [monorepo, tooling, directory-structure]
status: decided
worklogs: [20260823-scaffold-app-modules]
---

前提: [purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) で決めた内容。

Go と React が同じリポジトリに混在するので無理なくモノレポで管理できるように設計して。
リポジトリルートと Go のタスクランナーには `just` を使用するようにして。
フロントエンドは pnpm で管理するようにして。必要に応じて workspace を利用して。要らないかもしれない。
