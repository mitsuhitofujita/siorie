---
date: 2026-09-04
tags: [infra, iac, terraform, deploy, cicd, github-actions]
status: proposed
worklogs: []
---

GitHub Actionsによるデプロイの実装。まずは手動でActionを実行するようにして。

いまはイメージの build/push（`just infra/publish-image`）も `infra/app` の apply も全部ワークステーションから手で回している。これを GitHub Actions の `workflow_dispatch` に乗せて、push トリガーは後回しにしたい。
bootstrap には `sts` / `iamcredentials` の有効化と、ロール未付与の休眠 `deployer` SA が先に用意してある（decision 0011）。WIF プールと `deployer` へのロール付与（Artifact Registry への push、`app` 層の apply に必要な分だけ）をどこの層に置くか、`platform` は人間専用のまま残せるか（decision 0014 の意図）が論点。
あと `image_tag` / `google_client_id` / `app_origin` の三つの `-var` を Actions 側でどう渡すか（inputs か vars か）を決めないといけない。
