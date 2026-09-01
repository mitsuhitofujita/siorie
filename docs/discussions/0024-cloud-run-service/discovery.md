---
date: 2026-08-30
tags: [infra, iac, terraform, deploy, cloud-run, cicd]
status: decided
worklogs: [0013-cloud-run-service]
---

ARへのイメージアップロードが完了した。インフラリソースをTerraformで用意する。

Artifact Registry へのコンテナイメージの push まで整ったので、次はそのイメージを動かす側のインフラ（Cloud Run などの実行環境、必要なサービスアカウントや IAM、ネットワークまわり）を Terraform で定義する話。
0022 の Terraform GCP ブートストラップ、0023 のイメージ build & push の続きにあたり、手動で作っていたリソースがあれば Terraform 管理へ寄せる整理も含むかもしれない。

ゴール:
イメージを配置し、Cloud Runがapplyできること。
エンドポイントにブラウザでアクセスした時、何かしらのレスポンスがあること。
