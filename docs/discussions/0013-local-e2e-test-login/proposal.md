---
date: 2026-08-27
---

# 提案: 開発環境限定のDevログイン経路

## 背景

認証必須のCRUD機能を実装するたびに、実Googleアカウントが無いこと・ブラウザ操作ツールの
Cookie/query stringガードにより、実ブラウザでのボタンクリックを伴う認証込みE2E確認だけができない
まま実装を終えている（0004・0011の worklogで2回連続で発生）。curlによるAPIレベルの検証や、
モックした `fetch` によるフロントエンドのユニットテストでは、ボタンの配線やフォームの実際の
送信といったUI結線の不具合は検出できない。

ローカル専用（開発環境限定）のDevログイン経路を用意し、Claude Codeのブラウザ操作による
自動E2E確認でこの穴を埋める。

## 採用する方式

### 1. Verifierの差し替え

`apps/api/internal/googleauth` には既に `Verifier` インターフェースの実装として
`FakeVerifier`（トークンの中身を見ず固定の `Claims` を返す）がテスト用に存在する。これを
本物のサーバー起動時にも差し込めるようにする。

`apps/api/cmd/server/main.go` で環境変数（仮称 `AUTH_DEV_LOGIN`）が `1` のときだけ、

- `Verifier` に `GoogleVerifier` の代わりに固定Claims（例: `Sub: "dev-test-user"`,
  `Email: "dev-test-user@example.com"`）を返す `FakeVerifier` を差し込む
- 後述のDevログイン用ルートを有効にする

の2つを行う。差し込み口は `server.Deps.Verifier` の1箇所のみで、Go build tagのような
コンパイル時の分離は行わない。CI/CD・デプロイ構成（0003-cicd-service-selection）が決まる際に、
この強度で十分かは改めて検討する。

### 2. Devログイン専用ルートの新設

`POST /api/auth/google` はHumaで登録されたJSON専用のエンドポイントで、`credential` を
JSONボディとして読む。素のHTMLフォーム送信（`application/x-www-form-urlencoded`）では
このエンドポイントへ直接POSTできないため、同一URLへの完全な同居は技術的にできない。

そこで、`/api/auth/google` のハンドラ内にある一連の処理

```
verifier.Verify → users.Upsert → sessions.DeleteExpiredForUser → sessions.Create → Set-Cookie
```

を共有関数として切り出し、`/api/auth/google`（Huma・JSON）と新設する
`POST /api/auth/dev-login`（chiの素のハンドラ・フォーム送信を受ける・`AUTH_DEV_LOGIN=1` の
ときだけ登録）の両方から呼ぶ。`dev-login` 側は `Verify` に渡す値がFakeVerifierには無視される
ため空文字列で構わない。

セッション生成・Origin検証というコードの実体は完全に共有されるため、「Verifierだけ差し替えて
本物のコードパスを通す」という方針の趣旨は保たれている。URLとリクエスト形式のみが分岐する。

Devログイン成功後のレスポンスは、フォーム送信（ページ遷移）による起動を想定し、JSONボディでは
なく `/` への302リダイレクトとする。

### 3. フロントエンドのDevログインボタン

ログインページ（`apps/web/src/pages/HomePage.tsx`）に、`import.meta.env.DEV` が真のときだけ
表示する素のHTMLフォームを追加する。

```html
<form method="POST" action="/api/auth/dev-login">
  <button type="submit">Dev Login</button>
</form>
```

`import.meta.env.DEV` はViteが `vite dev` 実行時にのみ真になる既存のビルド時フラグで、
本番ビルド（`vite build`）では常に偽になる。バックエンド用に新しいフロントエンド環境変数を
増やす必要はない。

フォームがJS実行を伴わないページ遷移として送信されるため、ブラウザ操作ツールの
Cookie/query stringガードには触れないはず、という判断で採用した。

## リスクと対応

- **環境変数の設定ミスによる本番有効化**: `AUTH_DEV_LOGIN` を本番環境で誤って `1` にすると、
  誰でも固定ユーザーとしてログインできてしまう。現状は本番デプロイ先自体が未決定
  （0003-cicd-service-selection）なので実害はまだ発生し得ないが、デプロイ構成を決める議論の
  中で、この環境変数がデプロイ設定に含まれないことを確認する必要がある。
- **`import.meta.env.DEV` とバックエンドの `AUTH_DEV_LOGIN` が非連動**: 例えば
  `vite build && vite preview` をローカルで行うと、フロントエンドはDevログインボタンを
  表示しないがバックエンドが `AUTH_DEV_LOGIN=1` のままということはあり得る（実害はなく、
  単にボタンが出ないだけ）。逆にバックエンド側だけ有効で `vite dev` を使っていれば、想定通り
  ボタンが機能する。

## 検討したが採用しなかった案

詳細は [minutes.md](minutes.md) の「検討したが採用しなかった案」節を参照。

- 専用エンドポイントで認証フローを丸ごとバイパスする案（セッション生成・Origin検証を
  一切通らなくなるため不採用）
- Go build tagによるコンパイル時除外（CI/CD未決定の現段階ではオーバーエンジニアリング）
- 任意ユーザー・複数セッションへの対応（想定利用者をClaude Codeのブラウザ自動確認に限定した
  ため不要）
- fetch送信のDevログインボタン（ブラウザ操作ツールのガードに引っかかるリスクがHTMLフォーム
  送信より高い）
- `GET /api/auth/dev-login` への直接navigate（実質的に認証フローのバイパスに近づくため）

## 実装時に確認しておきたい点

- Devログイン成功後の302リダイレクト先が `/` で実際のUXとして問題ないか（実装しながら確認）。
- `AUTH_DEV_LOGIN=1` かつ実際にブラウザ操作ツールでDevログインボタンをクリックして、
  Cookie/query stringガードに実際に引っかからないかどうかは、今回の提案の前提そのものなので、
  worklogでの実装直後に必ず検証する。
