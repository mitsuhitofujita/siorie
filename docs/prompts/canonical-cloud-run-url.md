# タスク: Cloud Run の決定的URLを正とし、旧ハッシュURLからリダイレクトする

あなたは siorie リポジトリ（Go API + React SPA のモノレポ）で作業する実装エージェントです。以下を実装してください。

- リポジトリ: Go 1.27（chi + Huma v2）の API（`apps/api`）と、Vite + TypeScript + React 19 の SPA（`apps/web`、pnpm）からなるモノレポ。
  `apps/api` と `apps/web` は独立したモジュールで、共有パッケージは無い。永続化は Firestore、認証は Google ID Token + サーバー側セッション（`__Host-session` クッキー）。
  本番は Cloud Run の単一サービスで、Go バイナリが `/api/*` とビルド済み SPA（`WEB_ROOT=/web`）の両方を配信する
- 実行方針: ルートの `justfile` が入口。`just setup` で Go / Web の依存を導入し、`just dev` で Firestore エミュレータ（8090）・API（8080）・Vite（5173）を1ターミナルで起動する。
  `just test` は API 側の使い捨てエミュレータ（8091）を自動で起動する。`just check` が format-check / lint / test / build（+ `terraform fmt -check`）を通す基本の検証。
  ローカル設定は `apps/api/.env` と `apps/web/.env`（`.env.example` 参照）に置き、git 管理しない。`apps/api/.env` の `APP_ORIGIN` は Vite の `http://localhost:5173` を指す
- 最初に読むべきドキュメント: `docs/spec/infrastructure.md`, `docs/spec/authentication.md`, `docs/log.md`

## 設計（この形で実装する。コードの細部は既存スタイルに合わせて調整してよい）

Cloud Run は同じサービスに2つのデフォルトURLを割り当てる。

- 決定的URL: `https://<service>-<project-number>.<region>.run.app`
- 非決定的URL: `https://<service-identifier>.run.app`（このサービスでは `https://siorie-<hash>-an.a.run.app` の形）

決定的URLを正とする。`APP_ORIGIN` は引き続き「唯一の許可オリジン」であり、CSRF の完全一致検査（`validateOrigin`）は変更しない。複数オリジンの許可リストにはしない。

`WEB_ROOT` が設定されているとき（本番と `just dev-static`）、`spaHandler` は GET/HEAD で `/api/` 以外のリクエストの `Host` を `APP_ORIGIN` の host と比較する。一致しなければ 302 Found で `APP_ORIGIN + r.URL.RequestURI()` にリダイレクトする。パスとクエリは保持する。リダイレクト先はリクエストの Host から組み立てない（オープンリダイレクトにしない）。

- `/api/*` はリダイレクトしない。未登録の `/api/*` は 404 のまま、登録済みの API は現行どおり（状態変更は Origin 不一致で 403、認証必須は 401）。
- POST などの非 GET/HEAD もリダイレクトしない。
- `APP_ORIGIN` の parse に失敗した場合はリダイレクトしない（現行挙動を維持）。
- リダイレクトは 302 とし、308/301 にしない。後で正を戻したときにブラウザの永久キャッシュで詰まらないようにするため。

Terraform の `cloud_run_url` は `.uri` ではなく `urls` から `.a.run.app` 以外を選び、決定的URLを返す。`.uri` は旧ハッシュ形式を返し続けるため、そのままだと次の作業者が `APP_ORIGIN` に旧URLを入れてしまう。

## 現状（実コードで確認済み）

- `apps/api/internal/server/auth.go:220-225` の `validateOrigin` は `origin == "" || origin != appOrigin` で拒否する完全一致。`APP_ORIGIN` は1つだけ。
- `apps/api/internal/server/server.go:88-90` は `deps.WebRoot != ""` のときだけ `router.NotFound(spaHandler(deps.WebRoot))` を登録する。
- `apps/api/internal/server/static.go:15-63` の `spaHandler(webRoot string)` は、`/api/` を 404、`/assets/` の不在を 404、それ以外の GET/HEAD を `index.html` にフォールバックする。Host の検査は無い。
- `apps/api/cmd/server/main.go:30` は `APP_ORIGIN` を必須環境変数として読む。
- `infra/app/main.tf:65-73` は `APP_ORIGIN` に `var.app_origin` を入れる。コメントは「`terraform output cloud_run_url` を渡す」と書いている。
- `infra/app/outputs.tf:1-4` の `cloud_run_url` は `google_cloud_run_v2_service.app.uri` を返す。
- `.github/workflows/deploy.yml:99-108` は GitHub Environment `production` の `APP_ORIGIN` シークレットを `-var app_origin` に渡す。workflow 自体の変更は不要。
- `docs/spec/infrastructure.md:103` は `cloud_run_url` を「legacy-hash `*.a.run.app` form」と説明している。同 106-108 行は `app_origin` を `terraform output cloud_run_url` から渡すと説明している。
- `README.md:69` の one-time setup も `APP_ORIGIN` を `cloud_run_url` から取ると書いている。
- 2026-11-04 の実測: 新URL（決定的）への `POST /api/auth/google` は、`Origin` が新URLのとき `403 {"detail":"request Origin ... is not allowed"}`。旧URL（ハッシュ）では同じダミー credential が `401 invalid Google ID token` になり、Origin 検査は通過する。両ホストとも `GET /` と `GET /api/hello` は 200 で、同じサービスに届いている。
- `apps/web/src/lib/auth.tsx:85-88` は `POST /api/auth/google` の失敗を握りつぶして `unauthenticated` に戻すだけなので、403 でもログイン画面に留まって見える。今回このUXは変えない。
- テスト: `apps/api/internal/server` のトップレベルテストは30件（`go test ./internal/server -v` の `=== RUN   Test...` のうちサブテストを除く）。`TestSPAHandler` は8サブテストを持つ。Web は15ファイル / 58件（`pnpm --dir apps/web test`）。

## タスク1: `spaHandler` に canonical host のリダイレクトを追加する

1. `apps/api/internal/server/static.go` の `spaHandler` を `spaHandler(webRoot, appOrigin string)` に変える。`net/url` で `appOrigin` を parse し、`u.Host` を canonical host として保持する。parse error または host が空ならリダイレクトしない。
2. 返すハンドラの先頭で、`strings.HasPrefix(r.URL.Path, "/api/")` の 404 判定の後、ファイル配信の前に、次を入れる。
   - `r.Method` が GET または HEAD
   - `canonicalHost != ""` かつ `!strings.EqualFold(r.Host, canonicalHost)`
   - このとき `target := strings.TrimSuffix(appOrigin, "/") + r.URL.RequestURI()` を作り、`http.Redirect(w, r, target, http.StatusFound)` で終了する。
3. `apps/api/internal/server/server.go:89` の呼び出しを `spaHandler(deps.WebRoot, deps.AppOrigin)` に変える。
4. `apps/api/internal/server/auth.go` の `validateOrigin` は変更しない。

観測可能な挙動:

- 旧URL（非 canonical）の `GET /groups/abc123?x=1` は `302` で `Location: https://<canonical>/groups/abc123?x=1`。
- 旧URLの `GET /api/nonexistent` は `404`（リダイレクトしない）。
- 旧URLの `POST /groups/abc123` は `404`（リダイレクトしない）。
- canonical host の `GET /` は従来どおり `200` で `index.html`。
- `WEB_ROOT` が空のローカル API では `spaHandler` 自体が登録されないため、挙動は変わらない。

## タスク2: Terraform の `cloud_run_url` を決定的URLにする

1. `infra/app/outputs.tf` の `cloud_run_url` を次の形にする（`urls` は provider 6.50 で利用できる computed attribute。`.uri` は旧ハッシュ形式のまま）。
   ```hcl
   output "cloud_run_url" {
     description = "The deterministic default URL ... (the canonical APP_ORIGIN). The legacy hash URL is also assigned but redirects here."
     value       = one([for url in google_cloud_run_v2_service.app.urls : url if !endswith(url, ".a.run.app")])
   }
   ```
   説明文は既存スタイルに合わせて調整してよい。`.a.run.app` を除外した結果が1件になる想定。0件なら `null`、2件以上なら `one()` がエラーになるので、その場合はコメントで理由を残す。
2. `infra/app/main.tf:65-73` のコメントを、決定的URLが canonical で、旧ハッシュURLも同じサービスに割り当てられるが SPA の GET/HEAD はリダイレクトされる、という説明に直す。`var.app_origin` を使う構造は変えない。
3. `infra/app/variables.tf:22-24` の `app_origin` description を「決定的デフォルトURL（canonical）。`terraform output cloud_run_url` が返す」に直す。
4. `infra/justfile` の `app_origin=<cloud-run-url>` の説明を、決定的URL（`just infra/output app` → `cloud_run_url`）に直す。
5. `README.md:69` の one-time setup の `APP_ORIGIN` の説明を、決定的URLに直す。旧ハッシュURLはリダイレクトされることも一言添える。
6. Cloud Run リソース、IAM、ingress、image、workflow は変更しない。

## タスク3: ドキュメントを更新する

- `docs/spec/infrastructure.md`: `infra/app` の節に、Cloud Run が決定的URLと旧ハッシュURLの両方を割り当てること、canonical は決定的URLで `APP_ORIGIN` がそれを保持すること、旧ホストの SPA GET/HEAD は 302 で canonical にリダイレクトすることを英語で書く。`cloud_run_url` は `urls` から決定的URLを返す（`.uri` は旧ハッシュ形式）と直す。`app_origin` の説明と、`production` Environment の `APP_ORIGIN` シークレットが決定的URLであること、OAuth Web クライアントの Authorized JavaScript origins に同じ origin が必要なことも直す。
- `docs/spec/authentication.md`: CSRF の節に、本番の `APP_ORIGIN` は決定的 Cloud Run URL で、もう一方のデフォルトURLは SPA の GET/HEAD だけ canonical にリダイレクトされ、状態変更 API は従来どおり `validateOrigin` で 403 になる、と英語で1〜2文足す。完全一致の仕様は変えない。
- `docs/log.md`: 末尾に英語で1見出し追記する。日付は作業した当日。内容は「2つの Cloud Run デフォルトURLのうち決定的URLを canonical にした」「旧ハッシュURLは SPA の GET/HEAD を 302 でリダイレクトする」「`cloud_run_url` を `urls` から決定的URLに変えた」「`APP_ORIGIN` シークレットと OAuth origin の更新が必要」の数行。
- `docs/spec/api.md`, `docs/spec/web.md`, `docs/spec/overview.md`, `docs/prompts/README.md` は変更なし（触らない）。docs とコードの矛盾に気づいても実装を止めず、その場で直せる範囲だけ直し、無理なら log に1行だけ書いて先に進む。

## 作業者による手動設定（実装エージェントの外）

以下はコード外で、実装エージェントには実行できない。完了報告に「残った手動作業」として明記する。

1. Google Cloud Console → APIs & Services → Credentials → 該当する OAuth 2.0 Web クライアント → Authorized JavaScript origins に、決定的URLの origin（`https://<service>-<project-number>.<region>.run.app`）を追加する。確認後に旧ハッシュURLの origin を削除してよい。
2. GitHub リポジトリ → Settings → Environments → `production` → Secrets → `APP_ORIGIN` を決定的URLに更新する。
3. `main` から `deploy` workflow を `workflow_dispatch` する（またはワークステーションで `just infra/apply app -var app_origin=<deterministic-url> ...` を実行する）。
4. デプロイ後、旧URLの `GET /` が canonical に 302 し、canonical で Google サインインが完了して `/groups` に遷移することをブラウザで確認する。旧ホストの `__Host-session` はホスト単位なので、既存ユーザーは canonical で再ログインが必要。

注意: `APP_ORIGIN` シークレットが旧URLのままデプロイすると、コードは旧URLを canonical とみなし、新URLを旧URLへリダイレクトする（意図の逆）。シークレットの更新とデプロイは同じ run で行う。

## テスト

- `apps/api/internal/server/static_test.go`:
  - `staticTestRouter` の `deps.AppOrigin` をテスト用の canonical origin（例: `https://app.example.com`）にする。
  - 既存の `TestSPAHandler` の各リクエストは `req.Host = "app.example.com"` にする（テスト構造体に `host` フィールドを足してもよい）。既存8サブテストの期待値は変えない。
  - 新しいトップレベルテスト `TestSPAHandlerRedirectsNonCanonicalHost` を1件追加する。ケース:
    - `GET /groups/abc123?x=1`, Host `legacy.example.com` → `302`, `Location: https://app.example.com/groups/abc123?x=1`
    - `GET /api/nonexistent`, Host `legacy.example.com` → `404`（リダイレクトしない）
    - `POST /groups/abc123`, Host `legacy.example.com` → `404`（リダイレクトしない）
    - `HEAD /`, Host `legacy.example.com` → `302`（ボディは問わない）
  - `TestSPAHandlerNotMountedWithoutWebRoot` は変更しない。
- 件数: `internal/server` のトップレベルテストは 30 → 31。`TestSPAHandler` の既存サブテスト8件は維持。Web は15ファイル / 58件のまま増減させない。
- 手動: `just dev-static` で `http://localhost:8080` を開き、`APP_ORIGIN` と Host が一致するためリダイレクトされず、従来どおり SPA が配信されることを確認する。`just dev`（Vite）では `WEB_ROOT` が空なので `spaHandler` は登録されず、リダイレクトは起きない。

## ドキュメント更新（実装と同じ変更に含める）

- `docs/spec/infrastructure.md`, `docs/spec/authentication.md`, `docs/log.md` を上記のとおり更新する。
- `docs/spec/api.md`, `docs/spec/web.md`, `docs/spec/overview.md`, `docs/prompts/README.md` は触らない。
- `docs/spec/` は英語で上書き更新する（既存規約）。

## 受け入れ条件

- `just check` がパスする（format-check / lint / test / build / `terraform fmt -check`）。
- `cd apps/api && go test ./internal/server -count=1 -v` でトップレベル31件がパスし、新しいリダイレクトテストの4ケースが通る。
- `pnpm --dir apps/web test` が15ファイル / 58件でパスし、件数が増減していない。
- 旧URLの `GET /groups/abc123?x=1` が `302` で `Location: https://<canonical>/groups/abc123?x=1` を返す（テストまたは手動 curl）。
- 旧URLの `GET /api/nonexistent` が `404`、旧URLの `POST /groups/abc123` が `404` で、リダイレクトしない。
- canonical host の `GET /` が `200` で `index.html` を返し、サインイン後に `/groups` へ遷移する。
- `just infra/output app` の `cloud_run_url` が決定的URL（`https://<service>-<project-number>.<region>.run.app`）を返す（apply 後。資格情報が無い場合は手動確認とする）。
- `docs/spec/infrastructure.md`, `docs/spec/authentication.md`, `docs/log.md` が更新され、無関係なファイルが変更されていない。
- 認証・セッション・Cookie・CSRF・API・Firestore・UI の挙動に回帰がない。特に `validateOrigin` の完全一致と `__Host-session` の仕様は変えない。

## 制約

- 新規依存パッケージを追加しない（`apps/api/go.mod` と `apps/web/package.json` の dependencies を変更しない。既存の依存のみで実装）。
- タスクと無関係なリファクタリング・整形・ファイル移動をしない。
- 既存のコードスタイルに合わせる（Go は `gofmt`、Web は ESLint / Prettier。既存ファイルの命名・import・コンポーネント構成に従う）。
- UI コピーは英語、`docs/spec/` と `docs/log.md` は英語（`docs/README.md` の規約）。
- 認証方式と `__Host-session` クッキーの仕様、`validateOrigin` の完全一致を変更しない。
- `APP_ORIGIN` を複数オリジンの許可リストにしない。
- Cloud Run の `default_uri_disabled` / `--no-default-url` を使わない。カスタムURL、カスタムドメイン、ロードバランサ、ingress、IAM を追加・変更しない。
- `.github/workflows/deploy.yml` を変更しない（`APP_ORIGIN` シークレットの値だけが運用で変わる）。
- SPA の UI・ルート・表示文言を変更しない。`docs/design/` を変更しない。
- デプロイ（`deploy` workflow の dispatch、`terraform apply`）は実行しない。`just check` までを検証する。

## 完了報告

日本語で、変更点・検証結果（`just check`、`go test ./internal/server -count=1 -v` の実数、Web テストの実数、手動確認）・残った手動作業（`APP_ORIGIN` シークレット、OAuth の Authorized JavaScript origins、デプロイ）を簡潔にまとめる。
