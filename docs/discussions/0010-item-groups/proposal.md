# グループのCRUD実装

## ステータス

提案。決定ではない。アイテムのCRUD実装、アイテム詳細ページのURL設計、API失敗時のエラー状態の具体的な表示は
別トピックへ先送りする。

## 背景

[purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) で
Firestoreデータモデルとグループ・アイテムの初期API一覧はすでに確定しているが、
`apps/api/internal/server/server.go` には hello と auth のエンドポイントしかなく、
groups/items のエンドポイントは1つも実装されていない。

一方フロントエンドには [0002-home-login-frontend-structure](../../worklogs/0002-home-login-frontend-structure/README.md)
でグループ・アイテムの一覧／作成／編集ページがすでに実装されているが、対応するバックエンドがないため動作しない。
`GroupEditPage.tsx` は単体GETがないため一覧を取得して `.find()` する
[0005](../0005-single-resource-get-for-groups-and-items/discovery.md) 記載のワークアラウンドのままであり、
未認証で `/groups` 以下へ直接到達した場合の挙動も [0006](../0006-unauthenticated-route-guard/discovery.md) の
通り未決定だった。

本提案は、グループエンティティのCRUDをバックエンド・フロントエンドの両方で実装し、その過程で0005・0006の
グループに関わる部分を解決する。アイテムエンティティのCRUDはスコープに含めない。

## スコープ

- 対象: グループエンティティのCRUD。バックエンドの新規実装と、フロントエンドの既存ページの再配線。
- 対象外: アイテムエンティティのCRUD（作成・更新・削除・単体取得・一覧取得）。既存の未接続状態のまま変更しない。
  アイテムの新規作成・編集ページ、`apps/web/src/lib/api.ts` のアイテム関連関数はそのまま残す。
- 対象外: API失敗時のエラー状態の具体的な表示（[0004](../0004-home-and-login/proposal.md) で元々先送りされた通り）。

## バックエンドAPI

| Method | Path | 用途 | 備考 |
| --- | --- | --- | --- |
| GET | `/api/groups` | グループ一覧の取得 | 既存仕様、新規実装 |
| POST | `/api/groups` | グループの作成 | 既存仕様、新規実装 |
| GET | `/api/groups/{groupId}` | グループの単体取得 | **新規追加**。[0005](../0005-single-resource-get-for-groups-and-items/discovery.md) のグループ側を解決する |
| PATCH | `/api/groups/{groupId}` | グループ名の変更 | 既存仕様、新規実装 |
| DELETE | `/api/groups/{groupId}` | グループと所属アイテムの削除 | 既存仕様、新規実装。配下のアイテムを削除してからグループを削除する（[0001](../0001-purpose-and-initial-tech-stack/proposal.md)で確定済みの方針）。再試行しても安全になるよう実装する |

- 認証済みコンテキストのユーザーID（`sub`）からFirestoreのパスを組み立てる。リクエストパラメーターのユーザーIDは使わない
  （[0001](../0001-purpose-and-initial-tech-stack/proposal.md)で確定済みの方針）。
- グループ名は必須、100文字以下とする。アイテムのタイトルと同じ上限とし、フロントエンド・APIの両方で検証する。
- `internal/store` の既存パターン（`UserStore`/`SessionStore` と同様のインターフェース + `FirestoreStore` +
  テスト用 `MemoryStore`）を踏襲し、`GroupStore` を追加する。
- `GET /api/groups/{groupId}` の新規追加により、`apps/web/src/lib/api.ts` の
  「単体GETがないため一覧から`.find()`する」旨のコメントとその実装は撤去する。
- アイテムの単体GET（`GET /api/groups/{groupId}/items/{itemId}`）とアイテム一覧GET
  （`GET /api/groups/{groupId}/items`）はいずれも今回実装しない。[0005](../0005-single-resource-get-for-groups-and-items/discovery.md)
  のアイテム側は open のまま残る。

## フロントエンド ページ・URL設計

| パス | ページ | 変更内容 |
| --- | --- | --- |
| `/groups` | グループ一覧 | 既存のまま。ただし各行のリンク先を `/groups/:groupId/edit`（直接編集）から `/groups/:groupId`（詳細）へ変更し、行の「編集」リンクは廃止する |
| `/groups/new` | グループ作成 | 既存のまま |
| `/groups/:groupId` | **グループ詳細（新設）** | グループ名の表示、所属アイテムの一覧、編集ページへのボタンを持つ。アイテム一覧はバックエンドが今回もないため、既存の空状態表示のまま。既存の `/groups/:groupId/items`（アイテム一覧専用ページ）を置き換えて廃止する |
| `/groups/:groupId/edit` | グループ編集 | 既存のまま。ただし初期データ取得を「一覧取得＋`.find()`」から `GET /api/groups/{groupId}` に置き換える。削除ボタン・確認モーダルの挙動は変更しない |
| `/groups/:groupId/items/new`、`/groups/:groupId/items/:itemId/edit` | アイテム作成・編集 | 変更しない（引き続き未接続のまま） |

### discovery.md の操作フローとの対応

1. `/groups`（一覧）→ 作成ボタン → `/groups/new`（作成）→ 作成ボタン → `/groups`（一覧）→
   作成したグループの `/groups/:groupId`（詳細）→ 編集ボタン → `/groups/:groupId/edit`（編集）→
   更新ボタン → `/groups`（一覧）
2. `/groups`（一覧）→ `/groups/:groupId`（詳細）→ 編集ボタン → `/groups/:groupId/edit`（編集）→
   削除ボタン → 削除確認ダイアログ → はい → `/groups`（一覧）

いずれも一覧から編集ページへの直接遷移は経由せず、詳細ページを必ず経由する。

## 未認証アクセス（0006の解決）

[0006](../0006-unauthenticated-route-guard/discovery.md) で挙がっていた3案（各ページでの `useAuth()` リダイレクト、
401をエラー状態として扱う、`AppLayout` での一括ガード）のうち、専用のガード機構は設けず、401を
「API失敗時の一般的なエラー状態」として扱う方針を採用する。

エラー状態の具体的な表示（何をどう出すか）は [0004](../0004-home-and-login/proposal.md) で元々別トピックへ
先送りされており、本提案でもその表示自体は決定しない。そのため、この方針を採用しても未認証アクセス時の見た目は
当面変わらない（現状通り、取得失敗が空状態として表示される）。表示が変わるのは、別トピックでエラー状態の
表示方式が決まってからになる。

## スコープ外

- アイテムエンティティのCRUD（作成・更新・削除・単体取得・一覧取得）。将来の別議論で扱う。
- アイテム詳細ページの新設とそのURL設計。グループ詳細ページと対称的な `/groups/:groupId/items/:itemId`
  （Firestoreのネスト構造に沿う形）が有力候補として議論に上ったが、決定はアイテムCRUDの議論に持ち越す。
  検討したが不採用となった案は [minutes.md](minutes.md) を参照。
- API失敗時のエラー状態の具体的な表示。
- [0005](../0005-single-resource-get-for-groups-and-items/discovery.md) のアイテム側（単体GET・一覧GET）は
  open のまま残る。

## 関連

- [0001: purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)
- [0004: home and login](../0004-home-and-login/proposal.md)
- [0005: single resource get for groups and items](../0005-single-resource-get-for-groups-and-items/discovery.md) — グループ側を本提案で解決する
- [0006: unauthenticated route guard](../0006-unauthenticated-route-guard/discovery.md) — 本提案で方針を決定する
