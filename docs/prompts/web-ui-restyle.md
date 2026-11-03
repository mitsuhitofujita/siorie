# タスク: Web UI をブルー基調のミニマルデザインに刷新する

あなたは siorie リポジトリ（Go API + React SPA のモノレポ）で作業する実装エージェントです。以下を実装してください。

- リポジトリ: Go 1.27（chi + Huma v2）の API（`apps/api`）と、Vite + TypeScript + React 19 の SPA（`apps/web`、pnpm）からなるモノレポ。
  `apps/api` と `apps/web` は独立したモジュールで、共有パッケージは無い。永続化は Firestore、認証は Google ID Token + サーバー側セッション（`__Host-session` クッキー）。
  本番は Cloud Run の単一サービスで、Go バイナリが `/api/*` とビルド済み SPA（`WEB_ROOT=/web`）の両方を配信する
- 実行方針: ルートの `justfile` が入口。`just setup` で Go / Web の依存を導入し、`just dev` で Firestore エミュレータ（8090）・API（8080）・Vite（5173）を1ターミナルで起動する。
  `just test` は API 側の使い捨てエミュレータ（8091）を自動で起動する。`just check` が format-check / lint / test / build（+ `terraform fmt -check`）を通す基本の検証。
  ローカル設定は `apps/api/.env` と `apps/web/.env`（`.env.example` 参照）に置き、git 管理しない。`apps/api/.env` の `APP_ORIGIN` は Vite の `http://localhost:5173` を指す
- 最初に読むべきドキュメント: `docs/spec/web.md`, `docs/log.md`, `docs/design/index.html`, `docs/design/styles.css`, および `docs/design/` の各ページ HTML

## 設計（この形で実装する。コードの細部は既存スタイルに合わせて調整してよい）

`docs/design/` の HTML と `docs/design/styles.css` が、承認済みの見た目の正本です。実装前にブラウザで `docs/design/index.html` を開き、各ページのモック（`login.html` / `groups.html` / `group-new.html` / `group-detail.html` / `group-edit.html` / `item-new.html` / `item-detail.html` / `item-edit.html`）を確認してください。HTML と本プロンプトが細部で矛盾する場合は、色・余白・階層・角丸・省略の挙動は HTML を正とし、ルート・API・コピー・挙動は現行コードを正とします。

### カラーとトークン

`apps/web/src/index.css` の `:root` を以下の役割に置き換える。既存の `--bg-1` / `--bg-2` の名前は残し、値だけ変える（他の CSS が参照しているため）。

- `--bg-1: #ffffff` — カード、入力、ヘッダ、シート、ダイアログの面
- `--bg-2: #e9e9e9` — ページ地、デスクトップのガター
- `--primary: #3148f6` — 主要ボタン、リンク、フォーカスリング、ブランドの点
- `--primary-hover: #1c4b8f` — primary の hover / pressed、eyebrow、副次強調
- `--primary-soft: rgba(28, 75, 143, 0.07)` — ディープブルーの薄い hover 地（新規）
- `--text: #1c2127` — 本文、見出し、アイテム名、巻数
- `--text-muted: #5e6673` — ヒント、キャプション、フッタ、副次ラベル
- `--text-subtle: #6f7683` — プレースホルダ専用（新規）
- `--border: #c9ccd2` — カード枠、フォームの罫、アイテム行の区切り
- `--border-strong: #767d89` — 入力欄の枠、フラットなアイテムリストの上下端（新規）
- `--error: #a33a32` — エラー文言、破壊的アクション
- `--error-hover: #8f312b`
- `--error-soft: rgba(163, 58, 50, 0.08)` — danger ghost の hover（新規）
- `--on-primary: #ffffff`
- `--ring: rgba(49, 72, 246, 0.3)`
- `--scrim: rgba(28, 33, 39, 0.46)` — シート／ダイアログの背景（新規）
- `--shadow-soft: 0 18px 48px rgba(28, 33, 39, 0.18)` — オーバーレイのみ

`--secondary` と `.badge` は未使用なので削除する（`@theme inline` の `--color-secondary` も削除）。`--radius-pill` も削除し、ボタンは pill にしない。`--font` は現行の OS 内蔵スタックを維持し、Web フォントは追加しない。`--fs-2xs` を 10px から 11px に上げる。その他の型・余白のスケールは現行の φ / Fibonacci を維持する。

角丸は `--radius-sm: 6px`, `--radius: 10px`, `--radius-md: 12px`, `--radius-lg: 16px`。アバターだけ 50%。アイテムリストは radius 0。

### レイアウト

- モバイル専用・ライト専用の 1 カラム、`--content-max: 430px` を維持する。PC 用の多カラムは作らない。
- ページ地は `--bg-2`。ヘッダは `--bg-1` の白、下に 1px `--border`。`app-main` は 24px padding、24px gap。フッタは 24px padding、11px、`--text-muted`、上に 1px `--border`。
- `app-shell` は 470px 以上で左右に 1px `--border` を出す（現行の 460px から 470px に変えてよい）。
- カードは白地 + 1px `--border` + 12px 角丸。影は付けない。影はシートとダイアログだけ。

### ボタン

- `.btn`: 10px 角丸、min-height 44px、横 padding 20px、font-size 14px / weight 600、アイコン 18px。pill にしない。
- `.btn-sm`: 36px、13px、アイコン 16px（セクション見出しの主アクション、フォームまわりの削除など）。
- `.btn-xs`: 30px、13px、アイコン 14px（eyebrow 行の Edit など）。
- variant: `primary`（#3148F6 地 + 白文字）、`outline`（青枠 + 青文字、hover は `--primary-soft`）、`ghost`（青文字、hover は `--primary-soft`）、`danger`（エラー地 + 白文字）、`danger-ghost`（エラー文字のみ、hover は `--error-soft`、新規）。
- すべてのボタンは先頭に line icon を置く（Google のレンダーするサインインボタンだけ例外）。
- `Button.tsx` の `variant` 型と `variantClass` に `danger-ghost` を追加する。`DeleteConfirmDialog` は Cancel = `outline` + `size="sm"`、Delete = `danger` + `size="sm"` にする（モックの 36px に合わせる。variant は変えない）。

### 一覧

- グループ一覧は「独立した白カード」を維持する。`GroupsListPage` の `Link.row.card` を `Link.group-card` に変える。`.group-card` は min-height 58px、padding 14px 16px、白地、1px `--border`、12px 角丸、カード全体がリンク。hover は枠を `--primary-hover` にし、背景を `--primary-soft` にする。`ul.list` の gap は 12px。
- グループ詳細のアイテム一覧は「カードではなく罫線だけのフラットな白バンド」にする。`ul.list` を `ul.item-list` に、`Link.row.card` を `Link.item-row` に変える。`.item-list` は list-style なし、padding 0、背景 `--bg-1`（白）、radius 0、側枠なし、上下に 1px `--border-strong`。行間は `li + li` の `border-top: 1px solid var(--border)`。`.item-row` は min-height 56px、padding 12px 16px、flex、title は flex:1 / min-width:0 / `white-space:nowrap` / `overflow:hidden` / `text-overflow:ellipsis` の1行固定。`vol.` は `flex:none` の右寄せ・tabular-nums、chevron は `flex:none` の 16px `--text-muted`。タイトルは `vol.` の手前で省略記号により途切れ、折り返さず、figure と重ならない。hover は `--primary-soft`、focus-visible は内側 2px の青 outline。白背景は視認性のためで、カードの角丸・側枠は持たせない。
- `.vol` / `.vol .unit` の見た目は現行を踏襲する（`vol.` は 11px muted、数字は 16px / 700 / tabular-nums / 3.25em 右寄せ）。`.row` と `.badge` の CSS は削除してよい。`className="row` と `badge` の残存参照を `rg` で確認する。

### グループ詳細の 3 段見出し

`GroupDetailPage.tsx` の現在の 1 つ目の `.sectionhead`（グループ名 + Edit）を、次の 3 段に置き換える。

```jsx
<div className="page-head">
  <div className="eyebrow-row">
    <span className="eyebrow">Group</span>
    <Button asChild variant="ghost" size="xs">
      <Link to={`/groups/${group.data.id}/edit`}>
        <Pencil strokeWidth={1.75} />
        Edit
      </Link>
    </Button>
  </div>
  <h1 className="group-title">{group.data.name}</h1>
</div>
```

その下に `Items` + `Add item` の `.sectionhead` を置く（`Add item` は `size="sm"` の primary）。`.page-head` は flex column / gap 4px、`.eyebrow-row` は flex / space-between / align center、`.eyebrow` は 11px / 700 / letter-spacing .14em / uppercase / `--primary-hover`、`.group-title` は 26px / 700 / line-height 1.2 / letter-spacing -.02em。見出しの並びは必ず「Group + Edit」「グループタイトル」「Items + Add item」の順にする。

### アイテム詳細

- `ItemDetailPage.tsx` はグループ詳細と同じ 2 段ヘッダにする。上段は `.eyebrow-row` の「Item」eyebrow + Edit（`variant="ghost" size="xs"`）、中段は `.item-title` のアイテムタイトル。`.item-title` は 26px / 700 / line-height 1.2 / letter-spacing -.02em / `overflow-wrap:anywhere` で、複数行に折り返す。`.sectionhead.oneline` と 1 行クリップは削除する。
- `.volume.card` は白カードのまま。`.volume` に `text-align: center` を足し、`.volume-label` と `.volume-num` を中央揃えにする。`.volume` の padding は 20px、`.volume-label` は 11px / 700 / uppercase / letter-spacing .12em / muted、`.volume-num` は 42px / 700 / line-height 1 / letter-spacing -.03em / tabular-nums にする。
- 「Add a volume」は `.toolbar` から `.item-actions` に変え、ボタンを横幅いっぱいにする（`.item-actions .btn { flex: 1; }`）。楽観的 PATCH・ロールバック・エラー文言は変更しない。

### フォーム

- 4 つのフォームページ（`GroupNewPage` / `GroupEditPage` / `ItemNewPage` / `ItemEditPage`）の `<form className="form">` を `<form className="form form-card">` にする。`.form-card` は白地、1px `--border`、12px 角丸、padding 20px。
- `.label` は 13px / 600。`.input` は 44px、1px `--border-strong`、10px 角丸、背景白、16px。placeholder は `--text-subtle`。focus は `--primary` 枠 + 3px `--ring`。invalid は `--error` 枠 + 赤リング。hint は 11px muted、error-text は 13px error。
- submit ボタンには `className="btn-block"` を足して横幅いっぱいにする（`.toolbar` は残してよい）。
- 編集ページの削除ボタンは `variant="danger-ghost" size="sm"` にする（塗りつぶしの danger から変更）。`.form-danger` の上罫線と右寄せは維持する。
- 削除確認ダイアログの Cancel / Delete は `size="sm"` にする。variant（outline / danger）は変えない。

### ログイン

- `LoginPage.tsx` の Google ボタンと caption を `<div className="home-card">` で包む。`.home-card` は白地、1px `--border`、16px 角丸、padding 20px、中央寄せ。
- 開発専用の `<form className="signin">` は `<form className="dev-block">` に変える。`.dev-block` は破線 1px `--border-strong`、10px 角丸、padding 12px、中央寄せ、背景は半透明の白。
- `GoogleSignInButton` と `auth.tsx` の `renderButton` 設定（`theme: 'filled_black'` など）は変更しない。Google のボタンは Google が描くままにする。モックの黒いボタンはその例外のプレースホルダである。
- `.home` の 430px / 1 カラム / 上下 52px padding は維持。brand 42px / 700 / letter-spacing -.035em、tagline 14px muted、caption 11px muted。

### オーバーレイ

- `.overlay-scrim` は `--scrim`。`.nav-sheet` は白地、右から、幅 82% / max 320px、padding 20px、左に 1px `--border`、`--shadow-soft`。ヘッダは 20px、ユーザー名は 13px muted、リンクは 14px / 600 / 44px 相当 / 6px 角丸 / hover は `--primary-soft` + `--primary-hover`。
- `.dialog` は max 360px、16px 角丸、padding 20px、`--shadow-soft`。h2 は 20px、本文は 13px muted、actions は右寄せ。既存の Radix の挙動（フォーカストラップ、Esc、ポータル）は変えない。

### 状態

- `.state` は白カードのまま（アイテム一覧のフラット化の対象外）。アイコン 36px `--text-subtle`、本文 14px、padding 52px 20px、gap 12px。
- 空状態の CTA は現行どおり置かない（作成はセクション見出しにある）。エラー状態の Retry は outline の sm。

## 現状（実コードで確認済み）

- `apps/web/src/index.css` は Tailwind v4 の `@import 'tailwindcss'` と、`@layer components` の独自クラス群。現在のパレットは moss（`--primary: #48624f`, `--bg-2: #f2ede0`, `--secondary: #e3c25c` など）、`.btn` は pill（`--radius-pill`）、`.card` は 13px 角丸、`.list` は 8px gap、`.row` は白カードの行、`.sectionhead` は baseline 揃え、`.volume` は `--fs-xl` 42px の数字。
- `GroupsListPage.tsx` は `ul.list` の中に `Link.row.card` を並べる。見出しは `<h1>Groups</h1>` + `New group`（`size="xs"`）。空状態は `EmptyState`、エラーは `ErrorState`。
- `GroupDetailPage.tsx` は 2 本の `useFetch`（group / items）。1 つ目の `.sectionhead` がグループ名 + Edit、2 つ目が Items + Add item。アイテムは `ul.list` の `Link.row.card` で、`.vol` と `.chev` を持つ。アイテムの error はアイテムセクションだけ `ErrorState` に差し替える。
- `ItemDetailPage.tsx` は `.sectionhead.oneline` のタイトル + Edit、`.volume.card` の Completed volume、`.toolbar` の Add a volume。`localVolume` で楽観的 +1 を行い、失敗時にロールバックして固定文言を出す。
- `GroupNewPage` / `GroupEditPage` / `ItemNewPage` / `ItemEditPage` は `.form`、`.field`、`.input`、`.toolbar`、`.form-danger` を使う。編集ページの削除は `Button variant="danger"`。
- `LoginPage.tsx` は `.home` に brand / tagline / `.signin`（Google ボタン + caption）/ Dev Login の `.signin` フォーム。`GoogleSignInButton` は `auth.tsx` にあり、`theme: 'filled_black'`, `shape: 'rectangular'`, `locale: 'ja'` で Google のボタンを描画する。
- `AppLayout` は `.app-shell` / `.app-header` / `.app-main` / `.app-footer`。`NavMenu` は `.nav-sheet`、`Dialog` / `DeleteConfirmDialog` は `.dialog`。`EmptyState` / `ErrorState` は `.card state`。
- `Button.tsx` の `variant` は `primary | outline | ghost | danger`、`size` は `default | sm | xs`。`DeleteConfirmDialog` は Cancel = outline、Delete = danger。
- Web のテストは 15 ファイル / 58 件が現時点でパスしている（`pnpm --dir apps/web test`）。スタイル変更でロール・表示文言・遷移は変えないため、件数は増減させない。
- `docs/spec/web.md` の Pages は「アイテムもグループと同じカード」と書いており、今回の白いフラットバンドと矛盾する。Styling も moss 前提なので更新が必要。
- `docs/design/` は承認済みのモック。`index.html` にパレット、型、余白、部品、全ページへのリンク、実装ルールがある。`styles.css` に実値がある。

## タスク1: `index.css` のトークンと共通コンポーネントを更新する

1. `apps/web/src/index.css` の `:root` を上記のパレットに置き換える。`--bg-1` / `--bg-2` の名前は残す。`--secondary`、`--radius-pill`、`.badge` を削除する。`--primary-soft`、`--border-strong`、`--text-subtle`、`--error-soft`、`--scrim` を追加する。`--fs-2xs` を 11px にする。`--shadow-soft` を新しい値にする。
2. `@theme inline` を新しいトークンに合わせる。`--color-secondary` を削除し、必要なら `--color-text-subtle` / `--color-border-strong` を追加する。
3. `body` は `--bg-2` / `--text` / `--font` / 16px / 1.618 を維持する。`text-rendering: optimizeLegibility` を足してよい。
4. `.btn` を 10px 角丸・44px・14px / 600・横 20px・アイコン 18px にする。`.btn-primary` / `.btn-outline` / `.btn-ghost` / `.btn-danger` / `.btn-danger-ghost` を上記の色にする。`.btn-sm` を 36px / 13px / 16px、`.btn-xs` を 30px / 13px / 14px にする。`.btn-block` と focus-visible のリングは維持する。disabled は opacity .45。
5. `.form` / `.form-card` / `.field` / `.label` / `.input` / `.hint` / `.error-text` / `.form-danger` を上記の値にする。`.input` の枠は 1px `--border-strong` にし、focus / invalid のリングを新色にする。
6. `.card` を白地 + 1px `--border` + 12px 角丸にする。`.list` の gap を 12px にする。`.group-card` を追加する。`.row` と `.badge` を削除する。
7. `.item-list` / `.item-row` / `.item-row .vol` / `.item-row .chev` を追加する。`.vol` / `.vol .unit` の数値表現は維持する。
8. `.app-shell` / `.app-header` / `.app-main` / `.app-footer` / `.wordmark` / `.avatar-btn` を上記の値にする。`.wordmark::after` の 5px の青い点を追加する。`.avatar-btn` は 36px / 50%、`.avatar-fallback svg` は 18px にする。
9. `.pagetitle` / `.sectionhead` / `.sectionhead h1` / `.sectionhead h2` を 26px / 20px、700 / 600、letter-spacing -.02em / -.01em、align-items center にする。`.page-head` / `.eyebrow-row` / `.eyebrow` / `.group-title` / `.item-title` を追加する。`.item-title` は `.group-title` と同じ 26px / 700 / 折り返し。`.oneline h1` は `ItemDetailPage` の変更後に未使用なら削除する。
10. `.volume` / `.volume-label` / `.volume-num` / `.item-actions` を上記の値にする。
11. `.state` / `.state svg` / `.state p` を更新する。
12. `.overlay-scrim` / `.nav-sheet` / `.nav-sheet-*` / `.dialog` / `.dialog h2` / `.dialog > p` / `.dialog .actions` を新色・新寸法にする。既存のアニメーションと `prefers-reduced-motion` は維持する。
13. `.home` / `.brand` / `.tagline` / `.home-card` / `.dev-block` / `.caption` を上記の値にする。`.home .brand::after` の 6px の青い点を追加する。`.google-btn` はアプリでは不要（Google が描画する）。モック専用のクラスをアプリ CSS に持ち込まない。
14. `rg` で `--secondary`, `--radius-pill`, `.badge`, `.row` の残存参照を確認し、不要なものを消す。`.row` は `GroupsListPage` / `GroupDetailPage` のクラス変更後にだけ消す。

## タスク2: ページのマークアップを更新する

1. `GroupsListPage.tsx`: `Link.row.card` を `Link.group-card` に変える。`New group` を `size="sm"` にする。`ul.list` は維持する。文言・ルート・`useFetch` は変えない。
2. `GroupDetailPage.tsx`: 1 つ目の `.sectionhead` を上記の `.page-head`（eyebrow + group title）に置き換える。Edit は `variant="ghost" size="xs"`。2 つ目の `.sectionhead` は Items + `Add item`（`size="sm"`）にする。`ul.list` を `ul.item-list`、`Link.row.card` を `Link.item-row` にする。2 本の `useFetch` とエラー分岐は変えない。
3. `ItemDetailPage.tsx`: `.sectionhead.oneline` を `.page-head`（`.eyebrow-row` の「Item」+ Edit ghost xs / `.item-title` の複数行タイトル）に置き換える。`.toolbar` を `.item-actions` に変える。`localVolume` / `useSubmit` / PATCH / ロールバックは変えない。
4. `GroupNewPage.tsx` / `GroupEditPage.tsx` / `ItemNewPage.tsx` / `ItemEditPage.tsx`: `<form className="form form-card">` にする。submit に `className="btn-block"` を足す。編集ページの削除を `variant="danger-ghost" size="sm"` にする。フィールド・バリデーション・遷移は変えない。
5. `LoginPage.tsx`: Google ボタン + caption を `.home-card` で包む。DEV の form を `.dev-block` にする。`GoogleSignInButton` の呼び出しと Google の設定は変えない。
6. `Button.tsx`: `variant` に `'danger-ghost'` を追加し、`variantClass` に `'btn-danger-ghost'` を追加する。既存の variant の挙動は変えない。
7. `AppLayout` / `NavMenu` / `Dialog` / `DeleteConfirmDialog` / `EmptyState` / `ErrorState` / `TextField` は、クラス名・サイズの変更が必要な場合だけ触る。`DeleteConfirmDialog` の Cancel / Delete には `size="sm"` を足す（variant は維持）。構造と挙動は変えない。

## 今回のスコープ外（実装しない）

- API・Firestore・認証・セッション・CSRF・ルート・データモデルの変更。
- 新しい依存パッケージ（`apps/web/package.json` / `apps/api/go.mod` の dependencies を変えない）。
- Web フォントの追加、フォントファイルの同梱、`--font` のファミリ変更。
- デスクトップ用の多カラム、ダークモード、テーマ切替。
- 一覧行への +1 ボタン、検索、並び替え、ページネーション、共有、通知などの新機能。
- Google の `renderButton` 設定（`theme: 'filled_black'` など）の変更。Google のボタンは Google が描くままにする。
- `docs/design/` の HTML / CSS の変更。これは承認済みの正本として扱う。
- テストの期待値の緩和・削除。スタイル変更でテストが落ちた場合は、原因を確認し、承認済みのマークアップに合わせる最小限の修正だけを行う。
- 無関係なリファクタリング、ファイル移動、整形。

## テスト

- Web: `pnpm --dir apps/web test` で 15 ファイル / 58 件がパスすること。件数を増減させない。スタイル変更はロール・表示文言・遷移を変えないため、既存テストはそのまま通る想定。`GroupDetailPage` の「Group」eyebrow 追加やクラス名変更で落ちるテストがあれば、テストの意図を弱めずに最小限修正する。
- 全体: `just check` が format-check / lint / test / build / `terraform fmt -check` をすべて通すこと。API 側のテスト件数は現状のまま。
- 手動: `just dev` を別ターミナルで起動し、http://localhost:5173 を Dev Login（`AUTH_DEV_LOGIN=1`）で確認する。`docs/design/` の各ページと見比べる。390px と 430px の幅で、横スクロールが出ないこと、長いグループ名・アイテム名が折り返すこと、グループ詳細の 3 段見出し、フラットなアイテムリスト、フォーム、ログイン、ナビシート、削除ダイアログを確認する。
- 本番相当: `just dev-static` で http://localhost:8080 を開き、SPA の配信・`/api/*` の 404・ログイン後の画面が同じ見た目であることを確認する。
- アクセシビリティ: Tab でボタン・リンク・入力に移動できること、focus-visible のリングが見えること、アイテム行の内側 outline、グループカードの外側 outline、ダイアログのフォーカストラップ（Radix）が維持されていることを確認する。

## ドキュメント更新（実装と同じ変更に含める）

- `docs/spec/web.md`: `Pages` の `GroupsListPage` / `GroupDetailPage` / `ItemDetailPage` / フォーム / `LoginPage` の記述を、今回の `.group-card` / `.item-list` / グループ詳細の 3 段見出し / アイテム詳細の `Item` + Edit と複数行タイトル / 中央揃えの Completed volume / `.form-card` / `.home-card` / `.dev-block` / `.item-actions` に合わせて英語で上書きする。`Components` に `danger-ghost`、`.group-card`、`.item-row`、`.item-actions`、`.page-head`、`.eyebrow`、`.item-title` を追記し、`Button` の「pill button」、`Dialog` / `Sheet` の「moss skin」、`TextField` の「moss tokens」という記述を新しい 10px 角丸・ブルーの新トークンに直す。`Styling` をブルー基調・10/12/16px 角丸・影はオーバーレイのみ・430px・OS フォント・白いフラットなアイテムリスト（radius 0・側枠なし・タイトルは1行省略）に書き換え、`.list` の 8px gap、`.row card`、pill ボタン、moss パレットの記述を残さない。`docs/spec/` は英語で上書き更新する（既存規約）。
- `docs/log.md`: 末尾に `## Web UI restyle (2026-11-03)` を追加し、パレット変更、グループカード維持、アイテムリストの白いフラットバンド化と1行省略、グループ詳細の 3 段見出し、アイテム詳細の Item + Edit と中央揃えの巻数、フォントと Google ボタンを維持したことを英語で数行書く。日付は作業した当日。
- 触らない spec: `docs/spec/api.md`, `docs/spec/authentication.md`, `docs/spec/infrastructure.md`, `docs/spec/overview.md`（API・認証・インフラ・リポジトリ構成は変更なし）。
- `docs/design/` は変更しない。

## 受け入れ条件

- `just check` がパスする（format-check / lint / test / build / terraform fmt -check）。
- `pnpm --dir apps/web test` が 15 ファイル / 58 件でパスし、件数が増減していない。
- 390px / 430px で横スクロールが出ない。`app-shell` の幅上限は 430px のまま。
- グループ一覧は独立した白カード（`.group-card`）で、カード間に 12px の隙間がある。リスト全体を囲む角丸ボックスはない。
- グループ詳細の見出しが「Group + Edit」「グループタイトル」「Items + Add item」の順になっている。
- グループ詳細のアイテム一覧は、白いフラットバンド（背景 `--bg-1`、radius 0、側枠なし、上下 1px `--border-strong` + 行間 1px `--border`）になっている。行の hover は `--primary-soft`。タイトルは1行固定で、`vol.` の手前で省略記号により途切れ、`vol.` と重ならない。
- アイテム詳細は `.page-head` の「Item + Edit」、複数行に折り返す `.item-title`、中央揃えの `.volume.card`（42px の数字）、横幅いっぱいの「Add a volume」を持つ。+1 の楽観的更新と失敗時のロールバックが従来どおり動く。
- 4 つのフォームは `.form-card` の白カードに入り、submit が横幅いっぱい、編集ページの削除が danger-ghost になっている。
- ログインは `.home-card` の Google ボタンと `.dev-block` の Dev Login を持ち、Google のボタン自体は変更されていない。
- ナビシートと削除ダイアログは白地・新パレット・影のみオーバーレイで、既存のフォーカストラップ / Esc / スクリムが動く。
- 主要なコントラストが仕様どおり: 白文字 on #3148F6 = 6.2:1、#1C4B8F = 8.56:1、#1C2127 on #E9E9E9 = 13.3:1、`--text-muted` on #E9E9E9 = 4.77:1、入力枠 #767D89 on 白 = 4.15:1（ページ地 #E9E9E9 に対して 3.42:1）。
- `docs/spec/web.md` と `docs/log.md` が更新され、`docs/design/` は変更されていない。
- 認証・ルート・API・データの挙動に回帰がない。

## 制約

- 新規依存パッケージを追加しない（`apps/api/go.mod` と `apps/web/package.json` の dependencies を変更しない。既存の依存のみで実装）。
- タスクと無関係なリファクタリング・整形・ファイル移動をしない。
- 既存のコードスタイルに合わせる（Go は `gofmt`、Web は ESLint / Prettier。既存ファイルの命名・import・コンポーネント構成に従う）。
- UI コピーは英語、`docs/spec/` と `docs/log.md` は英語（`docs/README.md` の規約）。
- 認証方式と `__Host-session` クッキーの仕様は変更しない。
- Terraform・Cloud Run・デプロイ workflow を変更しない。
- Google の `renderButton` 設定（`theme` / `shape` / `size` / `text` / `locale`）を変更しない。
- `docs/design/` のモックを実装中に書き換えない。モックと矛盾する判断が必要になったら、自己判断で変えず、完了報告に「残った問題」として書く。

## 完了報告

日本語で、変更点・検証結果（`just check` と Web テストの実数、手動確認した幅とページ）・残った問題を簡潔にまとめる。
