---
date: 2026-08-30
tags: [infra, iac, terraform, cloud-run, auth]
status: proposed
worklogs: [0013-cloud-run-service]
---

worklog [0013-cloud-run-service](../../worklogs/0013-cloud-run-service/plan.md)
の difficulty「The constructed APP_ORIGIN is wrong」を discovery として起こし直す。

proposal [0024](../0024-cloud-run-service/proposal.md) は Cloud Run サービスの
`APP_ORIGIN` env を「サービス自身の `run.app` URL を project number から決定論的に
構築する」と定めた（`https://siorie-<project number>.<region>.run.app`）。狙いは
「サービスは自分の `.uri` を同じリソース定義内で self-reference できない」制約を
避けつつ、二段階 apply をせず一回で実値に最も近い値を入れること。

操作者が apply したところ、実際に割り当てられた URL は旧形式（ランダムハッシュ ＋
リージョンコード）だった。構築値と一致しない。

手が止まったのは、`terraform output cloud_run_url` と、`curl` レスポンス body の
`$schema` フィールドが指す host が、Terraform state に入っている構築済み
`APP_ORIGIN` と別物だと気づいたとき。

## 具体的な足がかり

- 構築した `APP_ORIGIN` env（`infra/prod/main.tf`、`google_cloud_run_v2_service.app`
  の `template.containers.env`）:
  `https://siorie-618741051931.asia-northeast1.run.app`
  （`data.google_project.this.number` = `618741051931` 自体は正しい）。
- 実 `google_cloud_run_v2_service.app.uri`（`terraform output cloud_run_url`）:
  `https://siorie-u6y3wdsaua-an.a.run.app`
- `curl -i https://siorie-u6y3wdsaua-an.a.run.app/api/hello` は `200` JSON を返し、
  body は
  `{"$schema":"https://siorie-u6y3wdsaua-an.a.run.app/schemas/HelloOutputBody.json",...}`。
  Huma は `$schema` をリクエストの scheme+host から組むので、ブラウザ / SPA が
  読み込むオリジンも `siorie-u6y3wdsaua-an.a.run.app` になる。
- proposal 本文「`APP_ORIGIN` を決定論的 URL で構築することについて」がこの食い違いを
  リスクとして先に挙げていた:「プロジェクトが旧 URL 形式（ランダムハッシュ）だと
  構築値が外れる。その場合は状態変更リクエストの `Origin` チェックが本番で崩れる」。
- 今回の超最小スコープでは実害なし。`GET /api/hello` は `Origin` チェックを踏まない。
- ズレが顕在化する条件: SPA を Cloud Run URL から配信し、そこから `POST /api/*`
  （グループ / アイテムの作成・更新・削除）を叩いた瞬間。ブラウザが送る `Origin` は
  `https://siorie-u6y3wdsaua-an.a.run.app`、サーバーが期待する `APP_ORIGIN` は
  `https://siorie-618741051931.asia-northeast1.run.app`。状態変更リクエストが弾かれる。
- `apps/api/cmd/server/main.go` は `APP_ORIGIN` 未設定なら `log.Fatalf` するが、
  「設定されているが誤り」は検知できない。plan / apply / re-plan すべてクリーンに通る。
- proposal は「SPA 同梱のラウンドで env を実値へ移す」と書いていたが `refinement` の
  位置づけだった。実際には必須で、しかも self-reference 不可の制約が残るため
  「移す」やり方自体が非自明。

## 違和感

サービスが自分の公開オリジンを知る手段が無い。Terraform 上、リソースは自身の `.uri`
を参照できず、proposal は project number からの構築で回避しようとしたが、その構築式が
前提にしていた URL 形式をこのプロジェクトは発行しない。plan も apply も警告なしで通り、
`GET` 系だけ叩いている限り一致しているように見える。実オリジンと `APP_ORIGIN` のズレは、
状態変更リクエストを本番 URL 経由で叩いて初めて露出する。

決定論的構築という選択肢が（このプロジェクトでは）成り立たないので、「Go サービスが
自分の `APP_ORIGIN` をどこから受け取るか」を選び直す必要がある。

## 候補の方向（未決）

- 実 URL リテラルを設定値として持つ。`infra/prod/terraform.tfvars` に
  `app_origin = "https://siorie-u6y3wdsaua-an.a.run.app"` を置くか `locals` に literal
  で書く。一度 apply して `.uri` を見れば分かる値なので以後は固定。ただしリポに URL が
  乗る（非秘密なので `project_id` / `region` と同じ扱いは可能）。
- 二リソース分割 / 二段階 apply。service を最小構成で作り、`.uri` 確定後に env を
  更新する。同一リソースの self-reference はできないので、`.uri` を別経路（data source
  か2つ目の変数）で env に流す形になる。
- 作成後に読み戻す。`data` で service を引き直して `.uri` を env に渡す。初回 apply では
  data が空なのでやはり二段階になりがち。
- `APP_ORIGIN` を廃し、サーバー側でリクエストの `Host` / `X-Forwarded-*` から信頼可能
  オリジンを導出する。env を1つ減らせるが、`Origin` チェックの信頼根拠をリクエスト
  ヘッダに移すことになるので慎重に。
- カスタムドメインを当てて `APP_ORIGIN` をそれに固定する（0001 は `run.app` URL 公開を
  想定しており、ドメインは範囲外）。

関連: [infra-per-deploy-inputs](../0026-infra-per-deploy-inputs/discovery.md)。
`APP_ORIGIN` を tfvars リテラルにするなら「非秘密のインフラ入力をどこに置くか」に合流する。
