---
date: 2026-08-23
tags: [cicd, infra]
status: decided
worklogs: [0017-github-actions-manual-deploy]
---

[purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) の CI/CD について、`Cloud Build` となっているが、クラウドプラットフォームのサービスはイケてる度合いがわからない。
サービスが無くなってしまうこともあり、このままで良いか再考したい。
例えば、AWS の CodeCommit。
このリポジトリは GitHub を利用している。
GitHub Actions との比較ではどうか？
