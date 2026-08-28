# フォーム・取得系のAPIエラー表示

## ステータス

提案。決定ではない。トースト通知基盤の導入、401の専用処理(自動ログイン誘導など)、
APIのエラーdetailをそのまま表示すること、サーバー側バリデーションエラーのフィールド単位表示は
別トピックへ先送りする。

## 背景

worklog [2026-08-27-items-crud](../../worklogs/2026-08-27-items-crud/plan.md) の調査で、
`ItemNewPage.handleSubmit` が `try` はあるが `catch` を持たず、API失敗時にユーザーへ何のフィードバックも
出さずボタンが無反応に見えるバグが見つかった。同じ形は `GroupNewPage`、`GroupEditPage`
(更新・削除)、`ItemEditPage`(更新・削除)にも存在する。

「API失敗時のエラー状態の具体的な表示」は
[0004: home and login](../0004-home-and-login/proposal.md) で最初に別トピックへ先送りされ、
[0010: item groups](../0010-item-groups/proposal.md)、
[0011: items crud](../0011-items-crud/proposal.md) でも同様にスコープ外とされ続けてきた。今回の
バグ報告は、3回連続で先送りしてきた領域を実際に踏み抜いた結果である。単発の実装漏れではなく、
方針自体が一度も決まっていないことの表れと捉え、本提案で決着させる。

議論の過程で、書き込み系だけでなく読み込み系(GET)にも同根の問題があることが分かった。

- `GroupsListPage`・`GroupDetailPage`(アイテム一覧)は、GET失敗時に `catch` で空配列をセットしており
  「0件」と「取得失敗」が同じ表示になる。
- `GroupDetailPage`(グループ本体)・`GroupEditPage`・`ItemEditPage`(いずれも初期ロード)・
  `ItemDetailPage` は、GET失敗時に `catch` で `null` をセットするのみで、
  `if (!group) return <Skeleton />` という分岐のため、**失敗時はローディング中の骨組みが永久に
  表示され続ける**(ローディングでもエラーでもない不定状態)。

## スコープ

- 対象: 書き込み系(`GroupNewPage`・`GroupEditPage`・`ItemNewPage`・`ItemEditPage` の
  create/update/delete)と読み込み系(`GroupsListPage`・`GroupDetailPage`・`GroupEditPage`・
  `ItemEditPage`・`ItemDetailPage` の GET)、双方のAPI失敗時にユーザーへエラーを表示する。
- 対象: 上記実装で重複するロジックを共通フックとして切り出す。
- 対象外: トースト通知基盤の導入。現状プロジェクトに通知ライブラリが入っておらず、導入コストに
  見合う理由がないため見送る。エラーはフォーム内・ページ内にインラインで表示する。
- 対象外: 401(セッション切れ)の専用処理。[0010](../0010-item-groups/proposal.md) で決めた
  「AppLayoutでの一括ガードは設けず一般的なエラー状態として扱う」方針をそのまま踏襲し、他のAPI
  失敗と区別しない。
- 対象外: APIが返すエラーdetail(huma由来、英語で実装詳細に近い文言)をそのまま表示すること。
  常に固定の日本語メッセージを使う。
- 対象外: サーバー側バリデーションエラーのフィールド単位表示。現状の入力はクライアント側の
  `required`/`maxLength`/`min` で事前に制約されており、サーバー側バリデーションエラーが平常系で
  発生する経路がない。
- 対象外: 自動リトライ・指数バックオフ。再試行はユーザー操作(ボタン押下)のみとする。

## 設計

### 共通フック

同型のロジックが書き込み4箇所・読み込み5箇所に重複するため、2つのフックに切り出す。
`apps/web/src/lib/` に既存の `useAuth`(`lib/auth-context.ts`)と同じ置き場所で追加する想定。
以下は方針を示すスケッチであり、細部はworklogで調整してよい。

**`useSubmit`**(書き込み系。作成・更新・削除で共通)

```ts
function useSubmit<Args extends unknown[], R>(action: (...args: Args) => Promise<R>) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (...args: Args): Promise<R | undefined> => {
    setIsSubmitting(true)
    setError(null)
    try {
      return await action(...args)
    } catch {
      setError('保存できませんでした。もう一度お試しください。')
      return undefined
    } finally {
      setIsSubmitting(false)
    }
  }

  return { isSubmitting, error, submit }
}
```

呼び出し側は `const result = await submit(...); if (result) navigate(...)` の形にする。成功時のみ
遷移する現在の挙動を保ったまま、失敗時は `error` をフォーム内に表示する。次の送信操作まで `error`
は保持され、入力変更だけでは消えない(送信するたびに `setError(null)` で仕切り直す)。

**`useFetch`**(読み込み系。一覧・詳細取得で共通)

```ts
type FetchState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error' }

function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchState<T> & { refetch: () => void }
```

`status` を明示的に3値で持つことで、「読み込み中」と「取得失敗」を区別できない現状のバグ
(初期ロード失敗が永久にスケルトン表示のままになる問題)を解消する。`refetch` は `ErrorState` の
再試行ボタンから呼ぶ。

### ErrorState コンポーネント

`components/EmptyState.tsx` と対になる `components/ErrorState.tsx` を新設する。`EmptyState` は
「0件+作成CTA」という責務が明確なため、エラー表示の責務を混ぜずに分離する。

```tsx
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-muted-foreground">読み込みに失敗しました。</p>
      <Button onClick={onRetry}>再試行</Button>
    </div>
  )
}
```

`GroupsListPage`・`GroupDetailPage`(アイテム一覧)は、`status === 'error'` のとき `EmptyState` の
代わりにこれを表示する。`GroupDetailPage`(グループ本体)・`GroupEditPage`・`ItemEditPage`・
`ItemDetailPage` は、`status === 'error'` のとき現在の `Skeleton` の代わりにこれを表示する
(初期ロード失敗を「ローディング中」と区別できるようにする)。

### フォームのインラインエラー表示

送信ボタンの上に、`error` が truthy のときだけエラーメッセージ領域を表示する。破壊的操作を示す色
(`text-destructive` など既存のトークンに合わせる)を使い、フォームの他の要素と並べて配置する。
削除確認ダイアログ(`DeleteConfirmDialog`)からの削除失敗も同じ `useSubmit` を使う想定のため、
ダイアログ側にもエラー表示領域が必要になる。

### メッセージ文言

常に固定の日本語メッセージを使う。

- 書き込み系: 「保存できませんでした。もう一度お試しください。」
- 削除: 「削除できませんでした。もう一度お試しください。」
- 読み込み系: 「読み込みに失敗しました。」

`apps/web/src/lib/api.ts` の `apiFetch` は、失敗レスポンスのbodyを読む変更を加えない。ステータス
コードやAPIのdetailに関わらずメッセージを固定するため、現状の「statusのみでErrorをthrow」する
実装のままで足りる。

## スコープ外

- トースト通知基盤の導入。
- 401の専用処理(自動ログイン誘導・専用リダイレクトなど)。[0010](../0010-item-groups/proposal.md)
  の一般エラー方針を踏襲する。
- APIのエラーdetailをそのまま表示すること。
- サーバー側バリデーションエラーのフィールド単位表示。
- 自動リトライ・指数バックオフ。

## 関連

- [0004: home and login](../0004-home-and-login/proposal.md) — エラー状態表示を最初に先送りした議論
- [0010: item groups](../0010-item-groups/proposal.md) — 401を一般エラーとして扱う方針の出典。
  エラー状態表示を再度先送り
- [0011: items crud](../0011-items-crud/proposal.md) — エラー状態表示を三度先送り
- worklog [2026-08-27-items-crud](../../worklogs/2026-08-27-items-crud/plan.md) — 本提案の発端となった
  バグ調査
