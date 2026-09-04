---
date: 2026-09-05
tags: [cicd, github-actions, security, supply-chain, mise, docker]
status: open
worklogs: [0017-github-actions-manual-deploy]
---

worklog [0017-github-actions-manual-deploy](../../worklogs/0017-github-actions-manual-deploy/plan.md)
の Difficulties から起こす（operator の指示でエージェントが下書き）。

本番へデプロイできる identity を扱うワークフローの依存が、全部 floating な tag で解決されている。

## 具体的な足がかり

- `.github/workflows/deploy.yml`: `actions/checkout@v7`、`jdx/mise-action@v4`、
  `google-github-actions/auth@v3`。major tag は書き換え可能。
- この job は `id-token: write` を持ち、auth の後はワークスペースに `deployer` を impersonate
  できる credential file がある。deployer は project の `roles/run.admin`、Artifact Registry の
  writer、`app` 層 state の読み書きを持つ。auth より前に動く action（checkout、mise-action）でも
  PATH・環境変数・ファイルを通じて後続ステップに影響できる。
- mise 側: `mise.toml` は `go` / `pnpm` / `just` / `gcloud` が `latest`、`node` が `lts`、
  `terraform` だけ `1.15.9`。`mise.lock` は無い（あれば mise-action が `--locked` で入れる）。
  mise 本体も mise-action の既定で latest。ツールは aqua registry / GitHub releases / vfox
  plugin から取得。proposal 0029 の未解決 2（ゲートの版が毎回変わる）と同根。
- コンテナ側: `infra/Dockerfile` の `golang:1.27-bookworm`、`node:24-bookworm`、
  `gcr.io/distroless/static-debian12:nonroot` は tag pin で digest pin ではない。Dockerfile の
  コメントが 0001 の再現性の線との差を認めている。
- リポジトリ設定: `sha_pinning_required: false`（`gh api repos/.../actions/permissions`）。
  `.github/dependabot.yml` は無い。
- proposal 0029 は GitHub の "security hardening with OpenID Connect" を参考資料に挙げているが、
  pin の方針は決めなかった。worklog 0017 の Difficulties は「Dependabot が無いので major tag」と
  書いて済ませている。
- 公開リポジトリ、operator 一人。Actions の実行ログは誰でも読める（secrets はマスク）。

## 違和感

- 一番強い資格情報（本番へデプロイできる identity）を扱う経路の供給網が、リポジトリの中で一番
  ゆるく固定されている。ローカルの apply は operator の ADC で、そちらは人が見ている。
- 「再現性」を 0001 で掲げ、terraform だけ exact pin にした判断
  （[decision 0011](../../decisions/0011-terraform-iac-layout.md)）と、他の全部が latest である
  現状の線引きが、どこにも書かれていない。

## 候補の方向（未決）

- action を commit SHA で pin し `# vX.Y.Z` コメントを添える。Dependabot の `github-actions`
  ecosystem を有効化して更新を PR に流す（PR 運用が無い現状では通知として使う）。
  `sha_pinning_required` をオンにして強制。
- `mise.lock` をコミットし、mise-action の `minimum_release_age` を設定。`latest` を
  major / minor pin に変える。
- Dockerfile の base image を digest pin に（更新の運用が要る）。
- 段階を分ける: 「auth より後のステップで動く action」だけ SHA pin する、など。
- 今の floating を意図として受け入れ、脅威モデル（公開リポ、一人運用、被害は本番一サービス）を
  decision として書く。

関連: [0029](../0029-github-actions-manual-deploy/proposal.md)（未解決 2）、
[0030](../0030-infra-apply-handoff/discovery.md)、
[decision 0011](../../decisions/0011-terraform-iac-layout.md)、
[decision 0012](../../decisions/0012-container-image-build-and-registry.md)、
[decision 0016](../../decisions/0016-spa-co-serving.md)。
