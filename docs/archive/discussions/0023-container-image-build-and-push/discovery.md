---
date: 2026-08-30
tags: [infra, iac, deploy, docker, cicd]
status: decided
worklogs: [0012-container-image-build-and-push]
---

デプロイに向けてDockerイメージを作成しアップロードするIaCの実装。

0022 の Terraform bootstrap の続きで、アプリを本番へ出すための土台づくり。
Dockerfile を用意してイメージをビルドし、Artifact Registry あたりへ push する経路を作る話。
そのビルドとアップロードを手動ではなく IaC（Terraform か CI 定義）として記述したい、というのが動機。
