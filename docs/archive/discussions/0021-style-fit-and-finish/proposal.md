# スタイルの微調整（fit and finish）

## ステータス

提案。決定ではない。実装は別の worklog で行う。

## 背景

[0016 visual style overhaul](../0016-visual-style-overhaul/proposal.md) の「苔 × 丸ゴシック」
デザインシステムが worklog 0009 で `apps/web` に反映された
（[decision 0006](../../decisions/0006-visual-style-system.md)）。
本 discovery は、その反映後に実際の画面を触って気づいた 9 点の小さな調整を挙げている。
大半は CSS レベルの詰めだが、2 点（フォント統一・backlink 全廃）は 0009 の worklog から
派生してまだ open の discovery（[0019](../0019-selfhosted-font-subset-mismatch/discovery.md) /
[0020](../0020-detail-page-parent-context/discovery.md)）と同じ論点に触れるため、
本提案でそれらを吸収して決着させる。

## 過去の検討との関係

- **フォント（項目 1）は [0006](../../decisions/0006-visual-style-system.md) を一部覆す。**
  0006 は「クローム = self-host した Zen Maru Gothic（Latin サブセット）／ユーザー入力 =
  OS 内蔵の丸ゴシック（Web フォントなし）」の 2 系統分割を、0016 のフィードバックを経て
  意図的に決めた。本提案はこの 2 系統を 1 系統（OS 内蔵の丸ゴシック）に畳み、self-host を
  やめる。0016 では `--font-ugc` に Noto Sans JP を Web フォントとして読む案が却下されて
  いるが、本提案はそれとは逆に「Web フォントを一切持たない」方向であり、矛盾しない。
- **backlink（項目 5・7）は [0020](../0020-detail-page-parent-context/discovery.md) を
  決着させる。** 0020 の候補は「`← Back`（親名なし）の正式化」か「親グループ名の表示
  （表示ごとに `GET /api/groups/{id}` が 1 本増える）」の 2 つだった。本提案は 3 つ目の
  道 ——「backlink をアプリ全体で持たない」—— を採る。関連する
  [0017](../0017-duplicate-api-requests-on-load/discovery.md)（ロード時リクエスト重複）は
  status: dropped。

## 提案内容

### 1. フォントを OS 内蔵の丸ゴシック 1 系統に統一

- `apps/web/package.json` から `@fontsource/zen-maru-gothic` を除去し、`main.tsx` の
  `import '@fontsource/zen-maru-gothic/latin-{400,500,700}.css'` 3 行を削除する。
- `index.css` の `--font` と `--font-ugc` を 1 本に畳む。残すスタックは現在の `--font-ugc`
  相当：

  ```
  --font:
    ui-rounded, 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic',
    'Yu Gothic UI', Meiryo, system-ui, sans-serif;
  ```

  丸ゴシックが確実に解決されるのは Apple 系（`ui-rounded` → SF Rounded、Hiragino Maru
  Gothic）のみ。Windows は Yu Gothic UI / Meiryo、それ以外（stock Linux 等）は
  `system-ui` → `sans-serif`（＝「丸ゴシックが無ければ単なるゴシック」。discovery の指定
  どおり）。
- `--font-ugc` トークンと `.ugc` クラスを削除し、`className="ugc"` の付いている箇所
  （グループ名 `GroupDetailPage` / アイテムタイトル `ItemDetailPage` / nav シートの
  ユーザー名 `NavMenu`）から外す。`.input { font-family: var(--font-ugc) }` と
  `.input::placeholder` のフォント上書きも削除（`body` の `--font` を継承する）。
- 影響：フォント資産のバンドルがゼロになる（現状の self-host 3 本 ~35 KB が消える）。
  クローム英字（見出し・ボタン・ラベル）の「丸ゴシックらしさ」は実行環境依存になるが、
  ユーザー入力（日本語のマンガタイトル等）とクロームが同じフォントで描画されるため、
  discovery の起点である「フォントのブレ」は解消する。

### 2. `/groups` の見出しとボタンを同一行に

- `GroupsListPage` の `<h1 className="pagetitle">Groups</h1>` ＋ 別 `<div className="toolbar">`
  を、`.sectionhead`（`Groups` ＋ 見出し用極小ボタン「New group」）の 1 行構成に置き換える。
  `Groups` の文字サイズは現行の `pagetitle` と同じ 26px 相当を維持する。
- グループが 0 件のときは従来どおり `EmptyState` が CTA（「New group」）を持ち、見出し側の
  ボタンは出さない（group-detail の「Add item」と同じ扱い＝ worklog 0009 difficulty 6）。

### 3–4. セクション見出しのボタンを見出し文字の天地に合わせる

- グループ詳細の `グループ名 ＋ Edit`（`.sectionhead` h1）、`Items ＋ Add item`
  （`.sectionhead` h2）、および項目 2 の `/groups` について、見出し内のボタンに
  **見出し用の極小サイズ**を新設して適用する。
  - min-height を見出しの行ボックスに合わせる（h1 で 〜30px、h2 で 〜26px 目安。実装時に
    実測で詰める）。padding を詰め、アイコンを 14–16px に縮める。
  - `.sectionhead` の縦位置合わせは、ボタン高 ≈ 文字高になった状態で天地が揃うように
    `align-items` を調整する。
- 既存の `.btn-sm`（36px、ツールバー・フォームの送信/削除ボタン用）は据え置く。結果として
  ボタンサイズは default（44px）/ sm（36px）/ 見出し用極小 の 3 段になる。
- タップ領域は 36px → 30px 弱に縮むが、44px 基準は既に `.btn-sm` の時点で崩れており、
  見出しのアクション（Edit / Add item / New group）はいずれも同義のリンクが別経路
  （空状態の CTA、行そのもの）から到達できるため許容する。

### 5・7. backlink をアプリ全体で廃止

- 以下の `<Link className="backlink">` を削除する：
  - `GroupDetailPage`（`← Groups`）
  - `ItemDetailPage`（`← Back`）
  - `GroupNewPage` / `GroupEditPage`（`← Groups`）
  - `ItemNewPage` / `ItemEditPage`（`← Back`）
- `index.css` の `.backlink` クラス定義も削除する。
- アプリ内の戻り／上方向の導線は、(a) ブラウザの戻る、(b) ヘッダーの `siorie`
  （項目 8 で `/` → 認証済みは `/groups` にリダイレクト）の 2 つに集約する。
- item detail から親グループへの 1 タップ導線は無くなる（ブラウザの戻る or `/groups`
  経由で辿り直す）。0020 が問題視していた「親名を出すために毎回リクエストを増やす」構図は、
  親名表示そのものをやめることで解消する。

### 6. アイテム一覧の `vol. N` を三桁固定幅の右揃えカラムに

- `index.css` の `.vol` に三桁分の `min-width`（`vol.` ユニット幅込み）を与え、
  `text-align: right` にする。`.row` 内でチェブロンとの `gap` を詰める（`.vol` と
  `.chev` の間だけ詰める、または `.vol` に負のマージン相当の調整）。
- `font-variant-numeric: tabular-nums` は既に効いているため、これで単数桁の行と三桁の行で
  数字の右端が揃う。四桁以上（現実にはほぼ無い）ははみ出しを許容する。

### 8. ヘッダーの `siorie` をリンクに

- `AppLayout` の `<span className="wordmark">siorie</span>` を
  `<Link to="/" className="wordmark">siorie</Link>` にする。
- スタイル：文字色を継承、下線なし、`:focus-visible` で他の要素と同じリング。`.wordmark` に
  `text-decoration: none; color: inherit;` を足す。
- フッターの `siorie`（`.app-footer`）は素のテキストのまま（リンクにしない）。

### 9. edit ページの削除ボタンを右寄せ＋上にセパレーター

- `ItemEditPage` と `GroupEditPage` の両方で、`<Button variant="danger" className="self-start">`
  を次の形に変える：
  - フォーム（`.form`）の末尾に、フォーム全幅の 1px ヘアライン（`border-top: 1px solid
    var(--border)`）を置く。
  - その下に danger ボタン（「Delete item」/「Delete group」）を **右寄せ**で配置する
    （`self-end`、またはツールバー同様 `justify-content: flex-end` のラッパ）。
  - セパレーターとボタンの間、およびセパレーターと直前のフィールドの間に十分な余白
    （`--space-4` 目安）。
- 削除確認ダイアログ（`DeleteConfirmDialog`）の呼び出しは変更なし。

## 付随して必要な変更

- **テストへの波及は小さい。** backlink をアサートしているページテストは無く
  （`NavMenu.test.tsx` の `link { name: 'Groups' }` はナビシート内のリンクで別物）、
  ヘッダーの `siorie` 文言をアサートするテストも無い。項目はいずれも表示コピーを変えないため、
  [0018](../0018-ui-copy-test-coupling/discovery.md) が指摘した「表示文字列に密結合した
  テストの広域破損」は今回は起きない。極小ボタン・`vol.` カラム・削除ボタン配置・フォント畳みも
  振る舞いテストの対象外。
- **`index.css` の整理。** `.backlink`、`.ugc`、`--font-ugc`、`.input` のフォント上書きを
  削除。`--font` の値を差し替え。極小ボタンの新クラス（または `.sectionhead .btn` の
  上書き）を追加。`.vol` に `min-width` / `text-align`。`.wordmark` にリンク用の指定。
  edit ページ用のセパレーター＋右寄せクラス。

## 既存の decision / discovery との関係

- **[0006 visual style system](../../decisions/0006-visual-style-system.md)** — フォントの
  段落（2 系統分割・Zen Maru Gothic を Latin サブセットで self-host・実行時 CDN なし）を、
  本提案が「OS 内蔵フォント 1 系統・Web フォントなし」に置き換える。実装が main に入った
  あとの `/decide` で 0006 に追記する。
- **[0019 selfhosted-font-subset-mismatch](../0019-selfhosted-font-subset-mismatch/discovery.md)**
  — 本提案（項目 1）が吸収する。self-host をやめることで「トークンの宣言とバンドル資産の
  ズレ」という 0019 の違和感そのものが消える。0019 は本提案の決着とともにクローズする。
- **[0020 detail-page-parent-context](../0020-detail-page-parent-context/discovery.md)** —
  本提案（項目 5・7）が「backlink 廃止」で決着させる。親名表示をやめるため、0020 の
  「親名のために毎回リクエストを増やすか UI を諦めるか」という二択が消える。
- **[0009 frontend app structure](../../decisions/0009-frontend-app-structure.md)** —
  「Deletion is initiated from the edit page」は維持（項目 9 は配置だけの変更）。
  共通レイアウト（ヘッダ = wordmark ＋ avatar、フッタ = wordmark のみ）の構成も維持
  （項目 8 は wordmark をリンクにするだけ）。
- **[0016 visual style overhaul](../0016-visual-style-overhaul/proposal.md)** — 型スケール・
  余白・角丸・パレット・`.badge` などデザインシステムの骨子は変更しない。本提案は 0016 が
  作った土台の上での詰め。

## スコープ外 / 未決

- コードへの反映（React コンポーネントと `index.css` の編集、依存関係の除去）。別の worklog。
- `/decide` での 0006 追記、0019 / 0020 のクローズ。実装が main に入ってから。
- 極小ボタンの正確な寸法（min-height / padding / アイコン径）。実装時に実測で決める。
- `.btn-sm` を将来的に極小ボタンへ寄せて 2 段に戻すかどうか。今回は 3 段のまま。
- 0018（テストの表示文字列密結合）は本提案では触れない。未解決のまま。

## 関連

- [0016: visual style overhaul](../0016-visual-style-overhaul/proposal.md) — 本提案が詰める対象のデザインシステム
- [0019: selfhosted font subset mismatch](../0019-selfhosted-font-subset-mismatch/discovery.md) — 項目 1 が吸収
- [0020: detail page parent context](../0020-detail-page-parent-context/discovery.md) — 項目 5・7 が決着させる
- [0018: ui copy test coupling](../0018-ui-copy-test-coupling/discovery.md) — 今回は非該当だが未解決
- [0017: duplicate api requests on load](../0017-duplicate-api-requests-on-load/discovery.md) — dropped。0020 と同じ「ロード時リクエスト」圏
- [decision 0006: visual style system](../../decisions/0006-visual-style-system.md) — フォント段落を実装後に更新
- [decision 0009: frontend app structure](../../decisions/0009-frontend-app-structure.md) — 削除の起点・共通レイアウトは維持
- [worklog 0009: visual style overhaul](../../worklogs/0009-visual-style-overhaul/plan.md) — 本 discovery 群の発生源
