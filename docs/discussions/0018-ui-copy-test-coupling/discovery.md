---
date: 2026-08-29
tags: [testing, frontend, dx]
status: open
worklogs: [0008-home-signin-button-lifecycle, 0009-visual-style-overhaul]
---

worklog [0009-visual-style-overhaul](../../worklogs/0009-visual-style-overhaul/plan.md)
で気づいたこと（worklog の difficulty 2 と「Structural note」に記録した内容を discovery
として起こし直す）。

proposal [0016](../0016-visual-style-overhaul/proposal.md) は「ビジュアルスタイル刷新」の
はずだったが、既存のページ・コンポーネントが全部日本語コピーを持っていて、discovery が
「英語のみ」を要求していたため、実質は見た目の刷新 + UI コピーの日本語→英語化になった。
コード側で ~40 文字列を書き換え、テスト側で ~50 箇所のアサーションを機械的に置換した。
対象テストは11ファイル（`App.test.tsx`, `NavMenu.test.tsx`, `DeleteConfirmDialog.test.tsx`,
`GroupsListPage` / `GroupDetailPage` / `GroupNewPage` / `GroupEditPage.test.tsx`,
`items/ItemDetailPage` / `ItemNewPage` / `ItemEditPage.test.tsx`）。

手が止まったのは、これが2回目の同じ形だと気づいたとき。1回目は
worklog [0008](../../worklogs/0008-home-signin-button-lifecycle/plan.md) の difficulty 1：
route guard を1つ足しただけで `App.test.tsx` がほぼ全書き換えになった。

## 具体的な足がかり

- テストが**表示文字列そのもの**でクエリしている：
  - `apps/web/src/pages/groups/GroupNewPage.test.tsx`
    → `screen.getByRole('heading', { name: 'グループを作成' })`,
      `screen.getByLabelText('グループ名')`,
      `screen.getByRole('button', { name: '作成する' })`
  - `apps/web/src/App.test.tsx`
    → `screen.getByRole('button', { name: 'メニューを開く' })` を4箇所、
      `findByText('読み込みに失敗しました。')` を1箇所
  - `apps/web/src/components/layout/NavMenu.test.tsx`
    → `getByText('メニュー')`, `getByRole('link', { name: 'グループ一覧' })`,
      `getByRole('button', { name: 'ログアウト' })`
- コピーはコンポーネントに直書き。例：`GroupNewPage.tsx` の
  `<h1 className="pagetitle">New group</h1>`、
  `useSubmit(api.createGroup, "Couldn't save. Please try again.")`。
  同じ文字列がテストにも文字列リテラルとして再入力される。
- 中間層がない。i18n レイヤも、コピー定数モジュールも、安定した
  `data-testid` / role キーの規約もない。`getByText` / `getByRole({ name })` /
  `getByLabelText` が表示文字列を一字一句マッチする。
- fixture の**データ**文字列（`'漫画喫茶'`, `'山田 太郎'`）は今回そのまま残した。
  これは「ユーザー入力内容は日本語のまま描画される」ことの検証なので別物。壊れたのは
  クローム（見出し・ラベル・ボタン・状態メッセージ）のアサーションだけ。

## 違和感

表示レイヤ（文言、どの画面がレンダーされるか）を変えるたびにテストが広域に壊れる。
テストが「振る舞い」ではなく「出力の一字一句」を検証しているから。0008 と 0009 で
同じ形が2回出た。次に UI コピーを触るときも同じ税金を払う。

## 候補の方向（未決・調査が要る）

- (a) テストは role + `data-testid` / 安定キーでクエリし、散文コピーの
  アサーションをやめる。ただし「ボタンのラベルが正しいこと」自体を検証したい
  ケースは残る。
- (b) UI コピーを1モジュールに集約し、変更を1箇所に。テストは同じ定数を
  import してアサートする（文字列の二重管理は消えるが、テストが「定数と一致する」
  だけの空虚な検証になりうる）。
- (c) 受け入れる。コピー変更は本質的にテスト全域に及ぶものとして、
  そういう作業だと見積もる。

関連: [0019-selfhosted-font-subset-mismatch](../0019-selfhosted-font-subset-mismatch/discovery.md)
（「クロームは英語のみ」という前提はこの discovery の帰結でもある）。
