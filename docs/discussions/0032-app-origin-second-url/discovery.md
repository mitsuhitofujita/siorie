---
date: 2026-09-05
tags: [infra, cloud-run, auth, deploy, csrf]
status: open
worklogs: [0017-github-actions-manual-deploy]
---

worklog [0017-github-actions-manual-deploy](../../worklogs/0017-github-actions-manual-deploy/plan.md)
の Difficulties から起こす（operator の指示でエージェントが下書き）。

`APP_ORIGIN` が operator の手入力に依存していて、しかも同じサービスに二つ目の URL が生きている。

## 具体的な足がかり

- 経緯: [0025](../0025-cloud-run-app-origin/discovery.md) で project number から組み立てた
  `APP_ORIGIN` が実 URL（legacy hash 形式）と一致せず 403。
  [decision 0016](../../decisions/0016-spa-co-serving.md) で「operator が
  `terraform output cloud_run_url` の値を `-var app_origin` で渡す」に。
  [decision 0017](../../decisions/0017-github-actions-manual-deploy.md) で CI 経路は GitHub
  Environment secret `APP_ORIGIN` に移った。値は `https://siorie-u6y3wdsaua-an.a.run.app`。
- 同じサービスに決定論的 URL `https://siorie-618741051931.asia-northeast1.run.app` も生きている
  （0017 の後に確認）:
  - `GET /api/hello` は両方 200。
  - `POST /api/auth/logout` を `Origin: https://siorie-618741051931.asia-northeast1.run.app` で
    送ると 403、legacy の Origin で送ると 204。
  - つまり決定論的 URL からアプリを開くと、表示は正常で、サインインと書き込みだけ全部 403。
    0025 と同じ症状が「正しい設定」の状態でも起きる。worklog 0016 で見た「UI は無言」の
    失敗と同型。
- 値が三か所に分散: GitHub Environment secret `APP_ORIGIN`、Terraform output `cloud_run_url`、
  Google Cloud Console の OAuth クライアントの authorized JavaScript origins（手作業、
  decision 0022 / worklog 0016）。どれもお互いを検証しない。
- 陳腐化の条件（推定）: legacy URL の hash は project 由来なので、同じ project 内でサービスを
  作り直しても変わらないはず。変わるのはサービス名・region・project を変えたときと、カスタム
  ドメインを付けたとき。頻度は低いが、ずれたときの症状が無言。
- design の "Not yet present" に "hand-maintained secret that goes stale" と書いてある。

## 違和感

- decision 0016 の rationale に「サービスは自分の公開 origin を知り得ない」とあるが、Cloud Run は
  知っている（`status.url`）。知り得ないのは Terraform の同一リソース内の自己参照だけ。その
  制約を operator の手入力で埋め、さらに secret に写した結果、真実の源が「人の記憶」になっている。
- Origin を一つに固定する CSRF 対策と、Cloud Run が同じサービスに複数の URL を配る事実が
  噛み合っていない。

## 候補の方向（未決）

- ワークフローで apply の前に `terraform output -raw cloud_run_url` を読んで `-var app_origin`
  に渡す。proposal 0029 は「初回はサービスが無い」で却下したが、初回は済んだ。secret が一つ減る。
- apply 後に `cloud_run_url` と `APP_ORIGIN` を比較し、不一致なら run を落とす検証ステップ。
  値の持ち方は変えないが、無言の失敗を有言にする。
- `APP_ORIGIN` を複数許可（legacy と決定論的の両方）。Go 側の Origin 検証の設計変更。
- 決定論的 URL を正として使い legacy を使わない運用。ただし `.uri` が返すのは legacy なので
  output と食い違う。
- OAuth クライアントの authorized origins との突き合わせは別件だが、同じ「三か所」の問題として
  一緒に扱うか。

関連: [0025](../0025-cloud-run-app-origin/discovery.md)、
[0026](../0026-infra-per-deploy-inputs/discovery.md)、
[decision 0016](../../decisions/0016-spa-co-serving.md)、
[decision 0017](../../decisions/0017-github-actions-manual-deploy.md)。
