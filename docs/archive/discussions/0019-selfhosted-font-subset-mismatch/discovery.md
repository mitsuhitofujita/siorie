---
date: 2026-08-29
tags: [frontend, css, fonts]
status: decided
worklogs: [0009-visual-style-overhaul, 0010-style-fit-and-finish]
---

worklog [0009-visual-style-overhaul](../../worklogs/0009-visual-style-overhaul/plan.md)
の difficulty 4 を discovery として起こし直す。

proposal [0016](../0016-visual-style-overhaul/proposal.md) は丸ゴシック（Zen Maru Gothic）を
「実装時 self-host、実行時 CDN は使わない」と定めていた。実装では
`@fontsource/zen-maru-gothic` の **Latin サブセットだけ**を読み込んだ。日本語サブセットは
バンドルしていない。

手が止まったのは、`--font` トークンの宣言と、実際にバンドルされる資産が食い違っていると
気づいたとき。

## 具体的な足がかり

- `apps/web/src/main.tsx`:
  ```
  import '@fontsource/zen-maru-gothic/latin-400.css'
  import '@fontsource/zen-maru-gothic/latin-500.css'
  import '@fontsource/zen-maru-gothic/latin-700.css'
  ```
  日本語サブセット（`japanese-*.css`）は読み込んでいない。ビルド成果物は
  `zen-maru-gothic-latin-*.woff2` 3本（各 ~11.5 KB）のみ。
- `apps/web/src/index.css` の `--font`:
  ```
  --font: 'Zen Maru Gothic', 'M PLUS Rounded 1c', ui-rounded,
          'Hiragino Maru Gothic ProN', system-ui, sans-serif;
  ```
  日本語の丸ゴシックファミリ名を並べているが、self-host されるグリフは Latin だけ。
  `'M PLUS Rounded 1c'`（proposal の第一フォールバック）は self-host すらしていない
  （ローカルに入っている人向けの名前指定として残っているだけ）。
- なぜ Latin だけで足りているか：feedback で `--font`（クローム）と `--font-ugc`
  （ユーザー入力内容、OS ゴシック、Web フォントなし）の2系統に分けた結果、
  クローム側テキストが英語のみになった
  （[0018-ui-copy-test-coupling](../0018-ui-copy-test-coupling/discovery.md) と連動）。
  だから self-host したフォントは日本語グリフを一度も描画しない。
- ズレが顕在化する条件：将来 heading / label / button / caption に日本語を入れると、
  self-host した Zen Maru Gothic ではなく `ui-rounded` → Hiragino Maru Gothic ProN →
  system に**静かにフォールバック**する。ビルドは通り、テストも通り、見た目だけが
  実行環境依存で変わる（Apple は内蔵丸ゴシック、Windows は Yu Gothic UI / Meiryo、
  それ以外は system sans）。
- decision [0006](../../decisions/0006-visual-style-system.md) と
  design [repository-structure.md](../../design/repository-structure.md) には
  "Latin subset only" と書いたが、`index.css` の `--font` を読んだ人は
  日本語も self-host されていると誤読する。トークンが実態を語っていない。

## 違和感

トークン（`--font`）の宣言と、実際にバンドルされる資産の間に暗黙のズレがある。
「クロームは英語のみ」という前提が崩れた瞬間に、警告なしで劣化する。
proposal が想定していた「丸ゴシックファミリを self-host」より実際の footprint は
ずっと狭い（~35 KB）が、その狭さがトークンからは見えない。

## 候補の方向（未決）

- `--font` から日本語フォント名を落として実態に合わせる。あるいは制約をコメントで明示。
- 日本語サブセットも self-host する（proposal が元々想定していた形。バンドルは増える。
  ただし現状クロームに日本語がない以上、当面は死荷重）。
- クローム側に日本語文字列を入れないことを lint / レビューで担保する仕組み。
