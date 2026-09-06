# 議事録

## 前提確認

- SPA 同梱配信は 0023・0024 で「別 discovery に送る」と繰り返し先送りされてきただけで、設計として検討され却下されたことはなかった。0028 がその先送り先。

## 論点 1: スコープ — discussion 0025（`APP_ORIGIN`）を取り込むか

- 質問: `discovery.md` は Dockerfile とハンドラの変更として書かれているが、SPA を Cloud Run URL から配信した瞬間、`POST /api/auth/google`（サインインそのもの）の `Origin` 検証が現状の構築値 `https://siorie-<project number>.<region>.run.app` と実 URL `https://siorie-u6y3wdsaua-an.a.run.app` のズレ（discussion 0025）で落ちる。0028 は「デプロイしたアプリが一通り動く」まで含むか、それとも 0025 待ちの別物として切るか。
- 採用: (a) 0028 が `APP_ORIGIN` の実値化を取り込む。「デプロイできるようにして」の実質を満たすため。

## 論点 2: 静的ファイルの持たせ方

- 選択肢: `go:embed`（単一バイナリだが web ビルド成果物を `go build` 前に `apps/api/` 配下へ置く必要があり、ビルド順の組み替えが要る） / イメージへコピーしてディスクから配信（ビルド順は独立、ランタイムのディレクトリ設定が要る）。
- 採用: ディスクから配信。

## 論点 3: `VITE_GOOGLE_CLIENT_ID` のビルド時入力

- `vite build` はこの値をバンドルへ inline するため、イメージビルド時の入力になる（同じ値が `infra/app` の `-var google_client_id` にも要る＝2 箇所独立入力）。
- 選択肢: (a) `publish-image` に `--build-arg`、操作者が渡す / (b) 非秘密なのでリポジトリへコミットし両方が読む / (c) ビルド時 inline をやめ実行時に `GET /api/config` 等で取得。
- 採用: (a)。0026（非秘密インフラ入力の置き場所、未解決）に合流する形。

## 論点 4: web ビルドの実行場所・キャッシュ方針・ルーティング方針

- 提示のみで異論なし。web ビルドは Docker マルチステージ内（`publish-image` は 1 コマンドのまま）。`/assets/*` は `immutable`、`index.html` は `no-cache`。`/api/*` の未マッチは JSON 404 のまま、`/assets/` のミスは 404、その他の非 `/api` GET のミスは `index.html` を 200（`BrowserRouter` のディープリンク対応）。

## 論点 5: `APP_ORIGIN` の具体的な解決方法

- 選択肢:
  - (a) `infra/app/terraform.tfvars` に literal をコミット — 却下。`google_client_id` を「コミットせず操作者が渡す」とした論点 3 の判断と非対称になるため。
  - (b) `infra/app` 内で `data "google_cloud_run_v2_service"` により自サービスの実 `.uri` を読み戻す — 却下（明示的な理由の言及はなし。(d) が採用された）。
  - (c) `APP_ORIGIN` env を廃止し、サーバーがリクエストの `Host` + `X-Forwarded-Proto` から許可オリジンを導出 — 却下。CSRF の判定基準をリクエストヘッダに移すことになるため、今回は見送り。
  - (d) `infra/app` に 3 つ目の `-var app_origin` を追加し、操作者が渡す — 採用。
- 派生の質問: `-var` が 3 本（`image_tag` / `google_client_id` / `app_origin`）になり 0026 の摩擦を悪化させる。緩和として `TF_VAR_app_origin` / `TF_VAR_google_client_id` をシェルに置く運用を明記するか。
  - 回答: 毎回明示。シェル変数化の運用は明記しない。0026 へ「3-var になった」という悪化を明示的に引き渡す。

## 論点 6: `WEB_ROOT` の名前と壊れている場合の挙動

- 名前: `WEB_ROOT` に決定（`STATIC_ROOT` / `SPA_ROOT` は候補止まり）。
- 存在判定: 任意 env、未設定なら静的ハンドラを積まない（`AUTH_DEV_LOGIN` / `FIRESTORE_EMULATOR_HOST` と同じ presence-triggered）。`infra/app` が `/web` を設定。
- セット済みだがディレクトリ／`index.html` が無い場合: 起動時 `log.Fatalf`（Cloud Run デプロイを赤くする）は却下。リクエスト時 404 のみに決定。理由の明示的な言及はなし。

## 論点 7: このラウンドのインフラ側スコープ

- AR の DELETE クリーンアップポリシー、同梱イメージをローカルで動かす `just` recipe — いずれも 0028 の対象外。両方とも別ラウンドへ。

## 論点 8: discussion 0025 の status

- 0028 が `APP_ORIGIN` を「実 URL リテラルを `-var` で渡す」形で解決するため、0025 の discovery を置き換える。
- 採用: 0025 の `status` を `proposed` にし、0028 の proposal へリンクする。「サービスが自分のオリジンを知る一般問題」として open のまま残す案は取らない。
