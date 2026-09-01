---
date: 2026-08-30
tags: [infra, iac, terraform, deploy, dx]
status: open
worklogs: [0013-cloud-run-service]
---

worklog [0013-cloud-run-service](../../worklogs/0013-cloud-run-service/plan.md)
の Review #2 を discovery として起こし直す。

proposal [0024](../0024-cloud-run-service/proposal.md) は Cloud Run のデプロイ対象
イメージ（`image_tag`）と OAuth Web クライアント ID（`google_client_id`）を
「デフォルトなしの Terraform 変数にし、apply 時に `-var` / `TF_VAR_` で渡す」と定めた。
リポジトリに値を置かない方針の帰結。

実装してみると、`infra/prod/` に対する plan / apply が、Cloud Run と無関係な変更の
ときも `-var` を2つ必須にする。素の `just infra/plan prod` が通らなくなった。

手が止まったのは、次に `infra/prod/` に何か足す（Firestore DB、DELETE クリーンアップ
ポリシー、予算）ときも、毎回 `image_tag` と `google_client_id` を思い出して渡さないと
plan すら走らない、と気づいたとき。

## 具体的な足がかり

- `infra/prod/variables.tf`: `image_tag`・`google_client_id` はどちらも
  `type = string`、`default` なし。
- `infra/justfile`: `plan layer *args` / `apply layer *args` にして
  `terraform ... plan|apply {{args}}` へ素通しするようにした。`just` 1.58 は `-var` を
  飲み込まない（`just --dry-run` で確認済み）。仕組みとしては動く。
- 帰結: `just infra/plan prod` 単体はエラー
  （`No value for required variable "image_tag"` ほか）。必ず
  `just infra/plan prod -var image_tag=<sha> -var google_client_id=<id>`。
- `image_tag` に渡す値は `git rev-parse` では決まらない。Artifact Registry に実在する
  タグでなければならず、docs のみのコミットでは image が増えないので「HEAD の SHA」と
  乖離する（worklog 0013 の別 difficulty）。操作者は
  `gcloud artifacts docker images list` で現物を確認してから渡す必要がある。
- `google_client_id` の実値（`618741051931-…apps.googleusercontent.com`）は非秘密
  （SPA バンドルに載る）だが、リポには置かない方針。`terraform.tfvars` には
  `project_id` / `region` だけがあり、この2つとは扱いが分かれている。
- 緩和策の `TF_VAR_image_tag` / `TF_VAR_google_client_id` をシェルに置く方法は、
  「変数未指定エラー」を「気づかず古い値で apply」に置き換える。特に `image_tag` は
  古い値のまま apply すると、無関係な変更のつもりが旧イメージへロールバックする事故に
  なる。
- proposal の「未解決・リスク」#1 がこの点をそのまま予告していた。

## 違和感

「リポに値を置かない」という方針と、「`infra/prod/` を Terraform で安全に育てる」という
要求が噛み合っていない。非秘密で、デプロイのたびに変わる値（`image_tag`）と、非秘密で、
ほぼ不変の値（`google_client_id`、および [0025](../0025-cloud-run-app-origin/discovery.md)
次第で `APP_ORIGIN`）が、同じ「デフォルトなし変数 ＋ CLI 渡し」に押し込まれていて、後者
まで毎回の入力を強制している。デプロイ履歴が git に残らない点も CLI `-var` 由来
（proposal で検討済み・承知の上）。

`infra/prod/` にリソースが増えるほど、この「毎回2つの `-var`」の摩擦は効いてくる。
どこかで「非秘密のインフラ入力をどこに置くか」を決める必要がある。

## 候補の方向（未決）

- 不変寄りの値（`google_client_id`、必要なら `APP_ORIGIN`）は
  `infra/prod/terraform.tfvars` にコミットする。非秘密なので `project_id` / `region` と
  同じ扱い。残る `-var` は `image_tag` 1つだけになる。
- `image_tag` も `terraform.tfvars` に書き、デプロイのたびに書き換えてコミットする
  （proposal の「検討したが採用しなかった案」。`git log` がデプロイ履歴になる代わりに
  コミットが増える）。
- `just infra/deploy <sha>` recipe を作り `publish-image` とペアにする（proposal で
  見送り済み。履歴は git に残らない）。
- `image_tag` にだけ「AR の最新タグ」を既定値として引く仕組み（`data` source か、recipe
  側で `gcloud` を叩いて注入）。ただし「最新 ≠ デプロイしたいもの」のときに危険。
- CI/CD（GitHub Actions + WIF、[0003](../0003-cicd-service-selection/proposal.md) の
  受け皿）が入るまで現状の摩擦を許容する。CI ではワークフローがビルドした `<sha>` を
  明示的に `-var` で渡すので、CLI 渡しの形はそのまま活きる。

関連: [cloud-run-app-origin](../0025-cloud-run-app-origin/discovery.md)。`APP_ORIGIN` を
実 URL リテラルとして持つなら、その置き場所はこの問題と同じ。
