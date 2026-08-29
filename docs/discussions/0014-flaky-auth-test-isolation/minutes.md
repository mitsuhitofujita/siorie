# 議事録: auth.test.tsx の flaky（window.google undefined）

discovery: [discovery.md](discovery.md)
関連: [0015-（home サインインボタン残留）](../0015/discovery.md)、
[0013-local-e2e-test-login](../0013-local-e2e-test-login/discovery.md)

## ディレクトリのリネーム

`0014` → `0014-flaky-auth-test-isolation`。
worklog [0006-form-error-handling](../../worklogs/0006-form-error-handling/plan.md) の
frontmatter と本文のリンク2箇所も追従修正した。

## 過去の議論との関係

同じ選択肢を検討して見送った履歴はない。ただし [0015](../0015/discovery.md)（`open`）は
`auth.tsx` の `renderSignInButton` / GIS まわりで「`AuthProvider` が React 管理外の命令的
DOM 操作をしている」ことを問題の中心に据えており、今回と根が同じ。今回は 0015 とは
分けて、テスト側の信頼性だけを対象にすることで合意した。

## エージェントが確認・切り分けした結果

discovery は「単体実行では絶対に再現しない・フルスイートでは低確率で再現」を根拠に
「ファイルをまたいだ test isolation の綻び」を疑っていた。これを検証した。

- フルスイート（アイドル時）×19 → 2 回失敗（≒10%、discovery と一致）。
- `auth.test.tsx` 単体（CPU 負荷下 `yes > /dev/null`）×25 → **6 回失敗**。
  → discovery の「単体は常に成功」は負荷不足による観測で、成り立たない。
- `auth.test.tsx` の `afterEach`（`vi.unstubAllGlobals()` + `delete window.google`）を
  無効化 → フルスイート（負荷下）×18 → **0 回失敗**。元に戻すと同じ負荷で再現。
- スタックトレース: `auth.tsx:118`（`window.google!.accounts...`）← `auth.test.tsx:14`
  （`Probe` の `useEffect` 本体）← React の `commitHookPassiveMountEffects`。

結論。**ファイルまたぎではなく、`auth.test.tsx` 自身のテストの passive effect が、
そのテスト自身の同期 `afterEach` の後に flush される競合。** テスト本体は
`await waitFor(status === 'unauthenticated')`（DOM テキストのみ）で抜けており、
`window.google` に触るのは別スケジュールの passive effect（`Probe` が `renderSignInButton`
を呼ぶ）。スケジューラが詰まると flush が `afterEach`（`delete window.google`）より
後ろにずれ込み、消えた後の `window.google` を読んで throw する。最初の `it` で出るのは
「直前テストの残骸」ではなく「このテスト自身の effect が teardown の後に走る」ため。
負荷と相関するのはこれで説明がつく。

- 影響を受けるのは `auth.test.tsx` のみ。もう一方の real `AuthProvider` を描く
  `App.test.tsx` は `window.google` を stub せず、実 `<script>` 分岐の `load`/`error` が
  jsdom で発火しないため `gisReady` が `false` のまま。`renderSignInButton` は
  `if (!gisReady) return` で抜け、`auth.tsx:118` に到達しない。

## エージェントが投げた質問

1. discovery の主眼（isolation / vitest 設定）から、判明した機構（act 外 effect ×
   同期 teardown の競合）の線へ提案を組み直してよいか。→ 組み直す。
2. 対処のレイヤーはどこか（A: テスト側で待つ / B: `renderSignInButton` を防御的に /
   C: `AuthProvider` に seam / D: `test.retry` で受け入れ）。→ 最初 D を選択。
3. 0015 と統合するか分離するか。→ 分離。
4. （D 再確認）影響範囲が `auth.test.tsx` の数テストだけと分かった上でなお D か。
   → **A に変更**。
5. A の実装形（`afterEach` で一括 flush / テスト毎に await 追加 / 両方）。
   → **`afterEach` で一括 flush**。

## エージェントが検証した修正案

`auth.test.tsx` の既存 `afterEach` 先頭に `await act(async () => {})` を追加し、
`vi.unstubAllGlobals()` / `delete window.google` の前に pending effect を flush する形。
CPU 負荷下で フルスイート×30 + `auth.test.tsx` 単体×14 = 計44回連続で 0 失敗
（対照の未修正版は同じ負荷で ~9 回内に再現）。

## 検討したが採用しなかった案

### D. `test.retry` で受け入れる（一度選ばれたが撤回）

- 競合そのものは残る。失敗率 10〜25% に対し `retry(2)` でも負荷下で ~1% は CI が落ちうる。
- 将来 `renderSignInButton` を壊して 50% 失敗する回帰が入っても「例の flake」に埋もれる
  （masking）。A はむしろ「ボタンが実際に描かれる」ことを待つ方向なので検証の網が増える。
- discovery を「単発の事故ではなく構造の問題」として起こした趣旨（歪みを潰す）に反し、
  症状を薄めるだけ。
- 手間は A（テストファイルのみ変更）とほぼ同じで、D を積極的に選ぶ利点が薄い。

### B. `renderSignInButton` に `window.google?.accounts?.id` の防御ガードを足す

- crash クラスは消えるが、GIS が本当に未ロードのケースも黙って no-op になり、
  実障害を隠す。プロダクトコードを触る割にテストの競合という本質は残る。

### C. `AuthProvider` に GIS ローダの seam（注入可能化）を入れる

- テストが実 `document.head` / `window.google` に一切触れない形にできて筋は良いが、
  範囲が広く、[0015](../0015/discovery.md) の「GIS コンテナのライフサイクルを React
  ツリーの外で管理する」方向と重なる。0014 はテスト側の最小修正に絞り、構造の話は
  0015 に委ねる。

### テスト毎に `await waitFor(() => expect(renderButton).toHaveBeenCalled())` を追加する

- テスト4 は既にこの形。だが該当テスト（1・6 ほか）それぞれに同じ待ちを書く必要があり、
  将来の新規テストでも同じ罠を踏みうる。`afterEach` で一括 flush する方が、
  各テストの assertion を「観測したい対象」に保ったまま一箇所でカバーできる。

## スコープ外（観測のみ）

- `App.test.tsx` は `AuthProvider` を6回描画し、そのたび実 `<script src=".../gsi/client">`
  を `document.head` に注入するが、除去しない。`isolate: true`（既定）のため今回の
  バグの原因ではないが、同じ `AuthProvider` の命令的 DOM 操作という匂いではある。
  0014 では触らない（0015 側の論点）。
- `auth.test.tsx` の `delete window.google` は `vi.unstubAllGlobals()` と冗長
  （`google` は元々グローバルに存在しない）。提案では整理に触れる程度に留める。
