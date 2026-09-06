# ビジュアルスタイル刷新（仕様 HTML）

## ステータス

提案。決定ではない。この段階ではコードへ反映せず、仕様としての HTML を
`docs/discussions/0016-visual-style-overhaul/` に置くところまでを対象とする。

## 背景

[0001 趣旨と初期技術選定](../0001-purpose-and-initial-tech-stack/proposal.md) は status「確定」で、
フロントエンドを **Tailwind CSS v4 + shadcn/ui**、かつ「セマンティックなデザイントークンを使い、
コンポーネントに具体的な色を直接書かない」と定めている。[decision 0001](../../decisions/0001-monorepo-scaffold.md)
と [design/repository-structure.md](../../design/repository-structure.md) もこれを前提に書かれている。

discovery.md は、この土台のうち **shadcn/ui を廃止**し、モバイル専用・ライトのみ・1 カラム・
黄金比・「やわらかい苔 × 丸ゴシック」・英語コピーという方向でスタイルを刷新することを求めている。
本提案はその方向を仕様 HTML に落とし、実装前の検討をまとめる。

過去に同じ選択肢を「検討して見送った」事実はない。ただし本提案は 0001 で**採用済み**の
土台（shadcn/ui）を外す方向であり、実装まで通れば design 文書の複数箇所
（`components/ui/`、Radix 依存、`--radius` など）を書き換えることになる。

## 成果物

`docs/discussions/0016-visual-style-overhaul/` に 9 枚の自己完結 HTML を置く。

| ファイル | 役割 |
| --- | --- |
| `styleguide.html` | トークン（色・型・余白・角丸・アイコン）と部品（ボタン・フォーム・リスト行・バッジ・空／エラー状態・オーバーレイ）のカタログ＋方針の文章 |
| `app-shell.html` | 共通レイアウト（ヘッダ／フッタ）とナビシート（右からスライド、開いた状態） |
| `home-noauth.html` | 未認証ホーム。共通レイアウト不使用。Google 製サインインボタン据え置き |
| `home-auth.html` | 認証済みホーム。共通レイアウト不使用。アカウント表示＋ Groups / Log out |
| `groups.html` | グループ一覧（共通レイアウト使用） |
| `groups-create.html` | グループ作成フォーム |
| `group-detail.html` | グループ詳細（グループ名＋ Edit ＋アイテム一覧） |
| `item-detail.html` | アイテム詳細（タイトル＋巻数＋ Edit ＋巻数インクリメント） |
| `delete-dialog.html` | 削除確認ダイアログ（背面に編集ページ、ブラー表示） |

配置場所は [0004-home-and-login](../0004-home-and-login/) が同種の仕様 HTML
（`home-auth.html` / `home-noauth.html`）を討議ディレクトリ直下に置いた前例に倣う。

## デザインシステムの骨子

### レイアウト

- 単一の中央寄せ 1 カラム、幅上限 **430px**。
- PC は「幅を制限する」対応のみ。カラム幅は保ち、ヘアラインの側罫を足す。専用の PC レイアウトは作らない。
- ライトモードのみ。ダークパレット・切替なし。
- ホーム（`home-*.html`）だけ共通レイアウトを使わない（[0004](../0004-home-and-login/proposal.md) 踏襲）。

### カラートークン

discovery の指定 4 色（#6B8570 / #EBD07A / #FFFFFF / #FAF7F0）は**方向**として保持し、
機能ペアが WCAG AA を満たすようトークンは深めに置く（フィードバックでの合意。詳細は minutes.md）。

| トークン | 値 | 用途 / 実測比（対白） |
| --- | --- | --- |
| `--primary` | #48624F | 主アクション地色・アウトライン・フォーカスリング。白文字 ≈ 6.7:1 |
| `--primary-hover` | #3C5343 | hover |
| `--secondary` | #E3C25C | 差し色専用（見出し罫・バッジ）。CTA には使わない |
| `--bg-1` | #FFFFFF | カード・入力・シート・ダイアログ |
| `--bg-2` | #F2EDE0 | ページ地・PC ガター・行 hover |
| `--text` | #2A332C | 本文・見出し ≈ 13:1 |
| `--text-muted` | #5C6A5F | 副次テキスト・プレースホルダー・フッタ ≈ 5.7:1 |
| `--border` | #BDB5A0 | 罫線・入力枠・カード枠（1px で視認可） |
| `--error` | #A9473E | エラー文言＋破壊的アクション ≈ 5.7:1 |
| `--ring` | rgba(72,98,79,.38) | フォーカスリング |

- 割り切り：10px のフッタ／キャプション、`opacity: .5` の無効ボタンは低コントラストのまま
  （無効状態は WCAG の対象外）。

### タイポグラフィ（2 フォント）

- **クローム**（見出し・ラベル・ボタン・ナビ・キャプション）＝丸ゴシック。
  `--font: 'Zen Maru Gothic', 'M PLUS Rounded 1c', ui-rounded, 'Hiragino Maru Gothic ProN',
  system-ui, sans-serif`。実装時 self-host、実行時 CDN は使わない。
- **ユーザーコンテンツ**（入力欄・プレースホルダー・入力内容の表示＝グループ／アイテム名、
  ユーザー名）＝ OS の内蔵ゴシック。
  `--font-ugc: ui-rounded, 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic',
  'Yu Gothic UI', Meiryo, system-ui, sans-serif`。**Web フォントは読み込まない**。
  理由：self-host する丸ゴシックは日本語の本文サイズで読みにくく、OS 標準の丸ゴシックがあれば
  それで十分（フィードバックでの合意）。Apple は内蔵の丸ゴシック、Windows は Yu Gothic UI /
  Meiryo、それ以外は system sans に解決される。
- スケール = 16 · φ：**10 / 16 / 26 / 42 / 68**、√φ 半段で **13 / 20**。
  本文 line-height = **1.618（φ）**、見出しは 1.2〜1.3。

### 余白・角丸

- 余白 = Fibonacci px（φ の近似）：**4 / 8 / 12 / 20 / 32 / 52**。
- 角丸 = 8 · φⁿ：**8 / 13 / 21**、ボタンは pill（999px）。
- 影は最小限。オーバーレイ（シート・ダイアログ）のみ `0 4px 20px rgba(47,58,49,.10)`。
  カードは影なし・1px 罫のみ。

### アイコン・ボタン

- 単色ラインアイコン（`currentColor`、stroke 1.75、round cap）。ボタン内 20px、単体 24px。
- ボタンは pill・最小高 44px・先頭にアイコン＋ラベル・アイコンとラベルの間 8px。
  variant：primary（苔地・白文字）/ outline（苔罫・苔文字）/ ghost（文字のみ）/ danger（brick 地・白文字）。
- **唯一の例外**：`home-noauth.html` の Google サインインボタン。Google Identity Services が
  レンダーするボタンをそのまま使い（[0004](../0004-home-and-login/proposal.md) 維持）、
  色・形・アイコンは Google 固定。styleguide にも例外として明記。

### 部品

- **入力欄**：`--bg-1`、1.5px 罫、角丸 13、高さ 44、フォーカスで苔罫＋リング。値は `--font-ugc`。
- **リスト行**：カード内、1px 区切り。行ラベル（エンティティ名）は `--font-ugc`。
  末尾の「読み終わった巻数」は **body サイズ（16px）の素の数字**（tabular-nums、先頭に小さな
  「vol.」ユニット）。以前のバッジ（10px）はフィードバックで廃止。
- **バッジ** `.badge`（`--secondary` の小さな pill）はシステムには残すが、巻数表示から外れたため
  現状は未使用。残すか削るかは実装時に判断。
- **空／エラー状態**：カード内に中央寄せのアイコン＋固定文言＋ CTA（作成／再試行）。
- **ダイアログ／シート**：Radix プリミティブ上に自前実装（フォーカストラップ・Esc・スクリム）。
  削除確認は独自ダイアログで、ブラウザ標準の `confirm()` は使わない
  （[0004](../0004-home-and-login/proposal.md) / [decision 0005](../../decisions/0005-form-and-fetch-error-feedback.md) 踏襲）。

### コンポーネント層

- **shadcn/ui は廃止**（`src/components/ui/` の生成コードを撤去）。
- **Tailwind v4 は継続**。トークンで色を持ち、コンポーネントに直値を書かない方針
  （0001 の原則）は維持。
- **Radix プリミティブ（Dialog・Label・Avatar）は残す**。挙動（a11y）のためで、見た目は
  苔トークンでゼロから当てる。Button / Dialog / Sheet は自前コンポーネントにする。

## 既存決定との関係

- **[0001](../0001-purpose-and-initial-tech-stack/proposal.md)（確定）を一部覆す。**
  「shadcn/ui を採用」を撤回する。Tailwind v4・セマンティックトークンの原則は残す。
  実装時に [decision 0001](../../decisions/0001-monorepo-scaffold.md) と
  [design/repository-structure.md](../../design/repository-structure.md) の該当記述を更新する必要がある。
- **[0004](../0004-home-and-login/proposal.md) は維持。** 共通レイアウトの構成、ホームの
  未認証／認証済みの出し分け、「専用 `/login` は作らない」、Google 製ボタン据え置きはそのまま。
- **[0011](../0011-items-crud/proposal.md) / [decision 0004](../../decisions/0004-item-entity-crud.md)
  に例外を設ける。** アイテム詳細ページは本来「タイトル・巻数の表示と編集ページへのボタンのみ」だが、
  本提案では detail 画面に**巻数を +1 する専用アクション**を置く。
  `PATCH /api/groups/{groupId}/items/{itemId}` への楽観的インクリメントに対応づけ、失敗時は
  数値をロールバックして固定文言のインラインエラーを出す。増加のみ（減算・修正は Edit）。
- **[0015](../0015/discovery.md)（open）と交差する。**
  Google 製ボタンを据え置いたため、認証直後にボタンが残る問題は本提案では解決しない。
  0015 は別トピックとして open のまま。

## スコープ外 / 未決

- コードへの反映（React コンポーネント、`index.css` のトークン、依存関係の増減）。別の worklog で行う。
- 編集ページ（`group-edit` / `item-edit` / `item-new`）の単独モック。`delete-dialog.html` の背面で
  編集ページを 1 度だけ描画している。
- `.badge` を残すか削るか。
- ナビシートに閉じる「×」を置くか（現状は置いている。0004 は明記していない）。
- 実装時のフォント self-host 方法、`--font-ugc` の最終的なフォールバック順。
- アクセシビリティの残課題（10px テキスト、無効ボタンの不透明度）。

## 関連

- [0001: purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) — Tailwind v4 + shadcn/ui を確定。本提案が shadcn を撤回する
- [0004: home and login](../0004-home-and-login/proposal.md) — 共通レイアウト・ホーム・Google 製ボタンの前提
- [0009: home with auth](../0009-home-with-auth/proposal.md) / [0015: home signin button residue](../0015/discovery.md) — Google ボタンの DOM 残り（open）
- [0010: item groups](../0010-item-groups/proposal.md) / [0011: items crud](../0011-items-crud/proposal.md) — グループ／アイテムの画面・URL 設計。item detail への例外はここに対する変更
- [0012: form error handling](../0012-form-error-handling/proposal.md) / [decision 0005](../../decisions/0005-form-and-fetch-error-feedback.md) — フォーム／取得エラー表示の踏襲
- [decision 0001](../../decisions/0001-monorepo-scaffold.md) / [design/repository-structure.md](../../design/repository-structure.md) — 実装時に更新が必要
