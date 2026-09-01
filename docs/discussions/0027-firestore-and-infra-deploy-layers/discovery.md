---
date: 2026-09-01
tags: [infra, iac, terraform, deploy, firestore]
status: decided
worklogs: [0015-firestore-and-infra-deploy-layers]
---

インフラでfirestoreを用意して。インフラのデプロイ単位を頻度で分けて。

design と decision 0011 では Firestore `(default)` データベースは「later worklog で `infra/prod/` に追加」と保留のまま。これを Terraform 管理に入れる話。
現状のレイヤは `infra/bootstrap/`（API 有効化・state バケット・休眠 deployer SA＝ほぼ変わらない）と `infra/prod/`（いまは Artifact Registry のみ）の2つだけ。ここに Cloud Run のリビジョンのような高頻度更新が加わる前提で、変更頻度でデプロイ単位を割り直したい。
土台（Firestore・Artifact Registry・IAM）と頻繁に apply するアプリ層（Cloud Run）を別ルートモジュールに分ける案。decision 0011 の「flat 2レイヤ・environments ラッパーを作らない」方針との整合が論点になりそう。
