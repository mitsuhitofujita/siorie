# 議事録：ビジュアルスタイル刷新

## 経緯

discovery.md をもとに、コードには反映せず「仕様としての HTML」を
`docs/discussions/0016-visual-style-overhaul/` にまとめる前提で議論した。
ディレクトリ名は連番のみだったため、内容から `0016-visual-style-overhaul` にリネームし、
discovery.md には frontmatter（`tags: [ui, design, css, frontend]`）を補った。本文は変更していない。

議論のあと 9 枚のモック HTML を作成し、複数回のフィードバックで調整した。
最終的に `proposal.md` へまとめた。

## エージェントが確認した点（＝欠けていた文脈）

1. **モック化の範囲。** discovery が挙げたのは 4 ページのみで、共通レイアウト・グループ詳細・
   アイテム系・削除ダイアログ・空／エラー状態が未指定だった。
   → 「アプリ全面をカバー」を選択（styleguide + app-shell + home×2 + groups + groups-create
   + group-detail + item-detail + delete-dialog の 9 枚）。
2. **shadcn 廃止後のコンポーネント層。** discovery は「廃止する」としか書いておらず、代替が不明。
   → 「Tailwind v4 は継続。shadcn/ui の生成コードは捨て、Radix プリミティブ（Dialog・Label・
   Avatar）は挙動のために残し、Button/Dialog/Sheet は苔トークンで自前実装」。
3. **カラーパレットの欠け。** primary/secondary/bg1/bg2 の 4 色しか指定がなく、本文色・淡色テキスト・
   境界線・エラー色・フォーカスリング・secondary の役割が未定義。
   → 「苔から派生させてエージェントが提案」。
4. **黄金比の適用粒度。** フォントサイズと余白の両方に φ を積むと値が急拡大する。
   → 「型は φ、余白は φ を近似する Fibonacci 列」。
5. **丸ゴシックの具体フォント。** → Zen Maru Gothic /（フォールバック）M PLUS Rounded 1c。
6. **Google サインインボタンの扱い。** 色・形・アイコンが固定で「単色アイコン」「苔カラー」に
   合わせられず、0015（open）とも交差する。
   → 「Google 製ボタンを唯一の例外として据え置き、proposal に明記」。

## 合意した主な内容

- モバイル専用・ライトのみ・1 カラム・幅上限 430px（PC は幅制限＋ヘアライン側罫のみ）。
- UI コピーは英語。ユーザーが入力するコンテンツ（マンガのタイトル等）は日本語で入る前提。
- 型スケール = 16 · φ（10 / 16 / 26 / 42 / 68、√φ 半段で 13・20）、line-height = φ、
  角丸 = 8 · φⁿ（8 / 13 / 21）、余白 = Fibonacci px（4 / 8 / 12 / 20 / 32 / 52）。
- ボタンは pill・最小高 44px・先頭に単色ラインアイコン＋ラベル。例外は Google サインインボタン。
- shadcn/ui は廃止。Tailwind v4 と Radix プリミティブは残す。
- 詳細は proposal.md。

## フィードバックで変えた点

1. **コントラストが全体的に低い。** ユーザーが「指示を逸脱してよい」と明言。パレットを深めに再調整：
   primary #6B8570→#48624F（白文字 3.35→6.7:1、AA 合格）、text #2F3A31→#2A332C、
   muted #7A857C→#5C6A5F（3.9→5.7:1）、border #E7E1D4→#BDB5A0（1px で視認可）、
   error #B4544A→#A9473E（4.6→5.7:1）、bg2 #FAF7F0→#F2EDE0（影なしで列とカードが分離）、
   secondary #EBD07A→#E3C25C、scrim 35%→55%。discovery の指定値は「方向」としてのみ保持。
2. **item-detail のタイトルを 1 行固定。** `white-space: nowrap` ＋ `overflow: hidden` ＋
   `min-width: 0`、省略記号なしで端でクリップ。Edit ボタンは `flex: none`。
3. **item-detail に巻数のインクリメント UI を追加。** detail 画面から `+` で
   「読み終わった巻数」を増やせる。巻数の数字を 42px に拡大。
   0011（detail は表示のみ）／decision 0004 に対する例外として扱う。
   - 最初は 52px の丸いアイコン単体ボタン → 「大きすぎてレイアウトが崩れる」との指摘で、
     他ボタンと同じ pill 形（先頭 plus アイコン＋「Add a volume」）に変更し、
     「Completed volume」カードの枠外・下へ。さらに `.toolbar` で右寄せ（groups 等に合わせる）。
4. **group-detail の巻数がバッジで小さい。** 10px の `.badge` をやめ、行右端に body サイズ（16px）
   の素の数字（tabular-nums、先頭に小さな「vol.」ユニット）へ。`.badge` は未使用になった。
5. **日本語が丸ゴシックだと読みにくい。** フォントを 2 系統に分離：
   `--font`（丸ゴシック）＝見出し・ラベル・ボタン・ナビ・キャプション、
   `--font-ugc`＝入力欄と入力内容の表示（グループ／アイテム名、ユーザー名）。
   - 最初は `--font-ugc` = Noto Sans JP（Web フォント）→ system sans。
   - 「OS に標準の丸ゴシックがあるならそれを使う／ダウンロードしない」との指示で、
     `ui-rounded, 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic',
     'Yu Gothic UI', Meiryo, system-ui, sans-serif` に変更。Web フォント読み込みは全廃。
   - 差が見えるようサンプルを日本語化（マンガ喫茶 / 葬送のフリーレン / ジョジョの奇妙な冒険… 等）。
6. **ユーザー名サンプル**は一時的に実名になっていたため `山田 太郎` に修正。

## 検討したが採用しなかった案

- **モック範囲を「4 ページのみ」または「4 ページ + styleguide」。** 共通シェルやフォーム／
  ダイアログのパターンが宙に浮くため不採用。全面カバーを選択。
- **shadcn と一緒に Radix も外して Dialog/Sheet を完全自前実装。** フォーカストラップ・Esc・
  ポータル等の a11y 実装コストが高く不採用。
- **Tailwind も外して素の CSS / CSS Modules へ。** 移行量が最大で、今回の目的（見た目の刷新）に
  対して過剰なため不採用。
- **黄金比を型・余白とも厳密に φ で連鎖。** 使える中間値が少なく、細かな間隔調整ができないため不採用。
- **φ を型スケールの比だけに使い、余白は 4px グリッド。** discovery の「マージンにも黄金比」から
  外れるため不採用。
- **丸ゴシックに Nunito / Varela Round。** Nunito は Latin 寄りで「丸ゴシック」の指示への忠実さが低く、
  Varela Round は単一ウェイト。Zen Maru Gothic を採用。
- **ログインボタンを自前の苔ボタン（"Continue with Google" ＋ 単色 G）にして GIS を
  プログラムから起動。** 0004 の「Google 製ボタンをそのまま使う」決定を再検討することになり、
  0015 と合流させる必要が出るため今回は見送り。Google 製ボタン据え置き＋例外明記とした。
- **プレースホルダー箱でログインボタンの決定を先送り。** 判断を放棄するだけなので不採用。
- **コントラスト初期案（#6B8570 をボタン地色に使い AA 未達を割り切る）。** ユーザーの
  フィードバックで撤回し、深い苔に置き換え。
- **`--font-ugc` に Noto Sans JP を Web フォントとして読み込む。** 「OS 標準優先・非ダウンロード」の
  指示で撤回。
- **item-detail のインクリメントを 52px の丸アイコン単体ボタン。** レイアウト崩れの指摘で
  通常の pill ボタンに変更。

## 積み残し（proposal に記載）

- 0001 の「Tailwind v4 + shadcn/ui」確定を覆す提案であること。実装時に
  design/repository-structure.md の複数箇所を書き換える必要がある。
- item-detail の巻数インクリメントは 0011 / decision 0004 への意図的な例外。
- 0015（Google ボタンの DOM 残り）は別トピックとして open のまま。
- `.badge` コンポーネントは巻数表示から外れて未使用。残すか削るかは実装時に判断。
- 編集ページ（group-edit / item-edit / item-new）は単独モックにしていない
  （delete-dialog.html が背面に編集ページを 1 度だけ描画）。
- フォント（丸ゴシック側）は実装時に self-host。実行時 CDN は使わない。
