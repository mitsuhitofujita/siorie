# 議事録：スタイルの微調整（fit and finish）

## 経緯

discovery.md には frontmatter が無かったため、内容から
`tags: [frontend, css, ui, fonts]` / `status: open` / `worklogs: []` を補った。本文は変更していない。
ディレクトリ名が連番のみ（`0021`）だったため、内容から `0021-style-fit-and-finish` に
リネームした（[0016](../0016-visual-style-overhaul/) の視覚刷新後の詰め作業であり、
単一のテーマに寄らない「調整の束」であるため）。

discovery は 9 項目の小さなスタイル調整を挙げている。2 ラウンド・計 6 問の確認を経て、
`proposal.md` にまとめた。

## エージェントが確認した点（＝欠けていた文脈）

### ラウンド 1

1. **フォント方針（項目 1）。** discovery の「最初からブラウザの持っている丸ゴシックを全体で
   使用する」は、self-host している Zen Maru Gothic を捨てて `--font` と `--font-ugc` を
   1 系統に統合する意味か。その場合、丸ゴシックが確実にあるのは Apple 系のみで、
   Linux / Windows のクローム英字は素の sans にフォールバックする。これを許容するか。
   → **1 系統に統合し Web フォントを廃止。** `@fontsource/zen-maru-gothic` と `main.tsx` の
   import を削除。0021 が [0019](../0019-selfhosted-font-subset-mismatch/discovery.md) を
   吸収してクローズする。Apple 以外で素の sans になるのは許容。

2. **戻り導線（項目 5・7・8）。** detail から backlink を消すと、アプリ内で親へ戻る手段は
   ブラウザの戻る＋ヘッダー `siorie`→`/groups`（項目 8）だけになる。削除は指定の 2 ページ
   （group-detail / item-detail）だけか、backlink を持つ他ページ（group-new / group-edit /
   item-new / item-edit）も揃えるか。
   → **全 detail / edit / new で backlink 廃止。** [0020](../0020-detail-page-parent-context/discovery.md)
   を「backlink 廃止」で決着させる。

3. **見出しとボタンの整列（項目 2・3・4）。** 「ボタンの天地を見出し文字の天地に揃える」を
   実装レベルでどう解釈するか。現状 `.btn-sm` は min-height 36px、見出しは h1=26px / h2=20px で、
   行ボックスよりボタンが高く、天地の両方を一致させるにはどちらかのサイズを変えるしかない。
   → **見出し用にボタンを文字高（〜28–30px）まで縮める。**

### ラウンド 2

4. **フォントトークンの畳み方（項目 1 の詰め）。** `--font-ugc` と `.ugc` クラスも整理するか。
   → **完全に畳む。** `--font-ugc` と `.ugc` を削除し、`className="ugc"`（グループ名・
   アイテムタイトル・nav シートの名前）も外す。`--font` 1 本に統一。

5. **Delete ボタン（項目 9）の範囲と体裁。** group-edit の「Delete group」も同じ形にするか。
   セパレーターはフォーム全幅の 1px ヘアライン（`--border`）でよいか。
   → **item-edit と group-edit の両方に適用。全幅ヘアライン＋右寄せ danger ボタン。**

6. **`vol. N` の右寄せ（項目 6）。** 「三桁表示できれば良い」の解釈は。
   → **三桁固定幅の右揃えカラム。** `.vol` に三桁分の `min-width` を与えて全行で桁を揃え、
   チェブロンとの `gap` を詰める。

## 異論なく確認された前提

- 項目 2 で `/groups` は現状の `pagetitle` ＋別 `toolbar` をやめ、`.sectionhead`
  （`Groups` は 26px 相当を維持 ＋ 見出し用極小ボタン）に組み替える。
- 見出し用の極小ボタンは新サイズとして追加し、既存の `.btn-sm`（ツールバー・フォーム用 36px）は
  据え置く（ボタンサイズが 3 段になる）。
- backlink 全廃後、`new` 画面で作成を中断する導線はブラウザの戻るに一本化（キャンセルボタンは
  追加しない）。

## 検討したが採用しなかった案

### フォント（項目 1）

- **トークンのズレだけ直して [0019](../0019-selfhosted-font-subset-mismatch/discovery.md) に
  戻す。** 2 系統を維持し `--font` から実体と食い違う日本語フォント名を落とすに留める案。
  見た目のブレ（discovery の起点）が残るため不採用。
- **JP+Latin をカバーする丸ゴシックを self-host。** 両プラットフォームで一貫した丸ゴシックに
  なるが、[0016](../0016-visual-style-overhaul/proposal.md) / 0019 が避けたバンドル増
  （数百 KB〜）を受け入れることになるため不採用。
- **最小差分（`--font` を `--font-ugc` の stack に書き換えるだけで、`--font-ugc` / `.ugc` は
  同じ値を指す別名として残す）。** 2 系統分割の根拠（0016：self-host 丸ゴシックは日本語本文で
  読みにくい／OS 標準優先）が消えた以上、冗長な別名を残す意味がないため不採用。完全に畳む。

### backlink（項目 5・7）

- **削除は指定の 2 ページ（group-detail / item-detail）のみ。** edit / new 系に backlink が
  残り、画面ごとに戻り導線が不統一になるため不採用。
- **今回は触らず 0020 の議論に委ねる。** discovery が明示的に削除を求めており、先送りする
  理由がないため不採用。なお 0020 が当初挙げていた候補は「`← Back`（親名なし）の正式化」と
  「親グループ名の表示（表示ごとにリクエスト +1）」の 2 つで、「削除」は候補になかった。
  関連する [0017](../0017-duplicate-api-requests-on-load/discovery.md)（ロード時リクエスト
  重複）は status: dropped。

### 見出しの整列（項目 2・3・4）

- **縦センター合わせ（サイズ変更なし）。** `.sectionhead` を `align-items: center` にする案。
  ボタンが文字より数 px 高いまま残り、「天地を揃える」という要求を満たさないため不採用。
- **見出しの行の高さをボタンに合わせる。** h1 / h2 の line-height を上げる案。文字位置が
  変わり縦余白が増えるため不採用。

### Delete ボタン（項目 9）

- **item-edit のみに適用。** group-edit の「Delete group」が現状（`self-start`）のまま残り
  不統一になるため不採用。
- **区切りは余白のみ（横罫線なし）。** discovery が明示的にセパレーターを求めているため不採用。

### `vol. N`（項目 6）

- **チェブロン（`>`）を item 行から外して行末へ寄せる。** group 行にはチェブロンが残るため
  行スタイルが不揃いになり不採用。
- **`gap` / `padding` を詰めるだけ。** 桁揃えがされず、「三桁表示できれば良い」の意図
  （単数桁と三桁の行で数字位置が揃う）に届かないため不採用。

## 積み残し（proposal に記載）

- 実装が main に入ったあと `/decide` で decision
  [0006](../../decisions/0006-visual-style-system.md) のフォント段落（2 系統分割・
  Zen Maru Gothic の self-host）を置き換え、0019 / 0020 を決着させる必要がある。
- [0018](../0018-ui-copy-test-coupling/discovery.md)（テストが表示文字列に密結合）は
  今回コピー変更を含まないため顕在化しないが、未解決のまま残る。
