# アイテムのCRUD実装

## ステータス

提案。決定ではない。アイテム一覧APIのページネーション方式、アイテムの別グループへの移動、API失敗時の
エラー状態の具体的な表示は別トピックへ先送りする。

## 背景

[0010: item groups](../0010-item-groups/proposal.md) でグループエンティティのCRUDを実装した際、
アイテムエンティティのCRUDは「バックエンドが1つも実装されていない状態でスコープが広すぎる」として
明示的に今回へ先送りされた。現在 `apps/api` にはグループのエンドポイントのみが実装されており、
アイテムのエンドポイントは1つもない。

フロントエンドには `ItemNewPage`/`ItemEditPage` が既に存在するが、対応するバックエンドがないため
動作しない。加えてこの2ページは、成功後に `navigate(`/groups/${groupId}/items`)` しているが、この
URLは0010で廃止済みであり、worklog
[0004-item-groups-crud](../../worklogs/0004-item-groups-crud/README.md) の「提案とのずれ」に
既知の不整合として記録されている。

本提案は、アイテムエンティティのCRUDをバックエンド・フロントエンド両方で実装し、0010で保留された
アイテム関連の論点を決着させる。

## スコープ

- 対象: アイテムエンティティのCRUD。バックエンドの新規実装と、既存フロントエンドページの再配線、
  アイテム詳細ページの新設。
- 対象外: アイテム一覧APIのページネーション。[0001](../0001-purpose-and-initial-tech-stack/proposal.md)
  で「設けること」自体は決定済みだが、方式・ページサイズは別トピックへ先送りする。
- 対象外: アイテムの別グループへの移動([0001](../0001-purpose-and-initial-tech-stack/proposal.md)の
  初期スコープ外のまま)。
- 対象外: API失敗時のエラー状態の具体的な表示([0004](../0004-home-and-login/proposal.md)で元々
  先送りされ、0010でも踏襲された)。

## バックエンドAPI

| Method | Path | 用途 | 備考 |
| --- | --- | --- | --- |
| GET | `/api/groups/{groupId}/items` | 所属アイテム一覧の取得 | 既存仕様、新規実装。ページネーションなし |
| POST | `/api/groups/{groupId}/items` | アイテムの作成 | 既存仕様、新規実装 |
| GET | `/api/groups/{groupId}/items/{itemId}` | アイテムの単体取得 | **新規追加**。[0005](../0005-single-resource-get-for-groups-and-items/discovery.md) のアイテム側を解決する |
| PATCH | `/api/groups/{groupId}/items/{itemId}` | アイテムの変更 | 既存仕様、新規実装 |
| DELETE | `/api/groups/{groupId}/items/{itemId}` | アイテムの削除 | 既存仕様、新規実装 |

- 認証済みコンテキストのユーザーID(`sub`)からFirestoreのパスを組み立てる
  ([0001](../0001-purpose-and-initial-tech-stack/proposal.md)で確定済みの方針)。
- 各ハンドラーは先頭で `GetGroup` を呼び、groupIdが存在しない(または他ユーザーのもの)場合は404を
  返す。Firestoreのサブコレクションは親ドキュメントの存在を前提としないため、この検証をしないと
  削除済み/存在しないgroupId配下にアイテムを作成できてしまう。groupIdの検証とitemIdの検証は独立して
  行う。
- GET・PATCHはitemId不在なら404を返す。DELETEはgroupIdが存在する限りitemId不在でも常に204を返す
  (グループ削除と同じ冪等性方針。[0003](../../decisions/0003-group-entity-crud.md)を踏襲し、再試行
  しても安全になるようにする)。
- アイテムタイトルは必須、100文字以下([0001](../0001-purpose-and-initial-tech-stack/proposal.md)で
  確定済み)。読み終わった巻数は0以上の整数(同じく0001で確定済み)。いずれもHumaの
  `minLength`/`maxLength`/`minimum` タグとフロントエンド入力の両方で検証する(グループ名と同じ
  パターン)。
- `internal/store` に `ItemStore`(`ListItems`/`CreateItem`/`GetItem`/`UpdateItem`/`DeleteItem`)を
  追加する。`GroupStore` と同じくメソッド名にエンティティ名を含める
  ([0003](../../decisions/0003-group-entity-crud.md)の rationale どおり、Goがメソッドオーバーロードに
  対応していないための命名)。
- `apps/web/src/lib/api.ts` の「単体GETがないため一覧から `.find()` する」旨のコメントと、
  `ItemEditPage` の該当実装を撤去し、`getItem` を追加する。

## フロントエンド ページ・URL設計

| パス | ページ | 変更内容 |
| --- | --- | --- |
| `/groups/:groupId/items/new` | アイテム作成 | 既存のまま。成功後の遷移先を `/groups/${groupId}/items`(廃止済み)から `/groups/${groupId}`(グループ詳細)へ修正する |
| `/groups/:groupId/items/:itemId` | **アイテム詳細(新設)** | タイトル・巻数の表示と、編集ページへのボタンのみを持つ。グループ詳細ページと同じ構成 |
| `/groups/:groupId/items/:itemId/edit` | アイテム編集 | 既存のまま。初期データ取得を「一覧取得+`.find()`」から `GET /api/groups/{groupId}/items/{itemId}` に置き換える。削除ボタン・確認モーダルはこのページに残す。更新・削除いずれも成功後の遷移先を `/groups/${groupId}` へ修正する |
| `/groups/:groupId` | グループ詳細 | アイテム一覧の各行のリンク先を、編集ページへの直接リンクからアイテム詳細ページへ変更する |

### discovery.md の趣旨との対応(操作フロー)

1. `/groups/:groupId`(グループ詳細、アイテム一覧を含む)→ 追加ボタン →
   `/groups/:groupId/items/new`(作成)→ 作成ボタン → `/groups/:groupId`(グループ詳細)→
   追加したアイテムの `/groups/:groupId/items/:itemId`(詳細)→ 編集ボタン →
   `/groups/:groupId/items/:itemId/edit`(編集)→ 更新ボタン → `/groups/:groupId`(グループ詳細)
2. `/groups/:groupId`(グループ詳細)→ アイテム詳細 → 編集ボタン → 編集ページ → 削除ボタン →
   削除確認ダイアログ → はい → `/groups/:groupId`(グループ詳細)

いずれも0010で確立したグループの操作フロー(一覧→詳細→編集)と対称にする。

## 解決される既存の宿題

- [0005: single resource get for groups and items](../0005-single-resource-get-for-groups-and-items/discovery.md)
  のアイテム側(単体GET)を、本提案で解決する。これによりグループ・アイテムとも解決済みとなる。
- worklog [0004-item-groups-crud](../../worklogs/0004-item-groups-crud/README.md) の「提案とのずれ」に
  記録された、`ItemNewPage`/`ItemEditPage` の遷移先が廃止済みURLのままだった不整合を修正する。

## スコープ外

- アイテム一覧APIのページネーション方式・ページサイズ。
  [0001](../0001-purpose-and-initial-tech-stack/proposal.md)の「設けること」自体の決定は維持し、
  方式は別トピックで決定する。今回はページネーションなしで一覧を返す。
- アイテムの別グループへの移動。
- API失敗時のエラー状態の具体的な表示([0004](../0004-home-and-login/proposal.md)・0010から継続して
  先送り)。

## 関連

- [0001: purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)
- [0003: group entity CRUD (decision)](../../decisions/0003-group-entity-crud.md)
- [0005: single resource get for groups and items](../0005-single-resource-get-for-groups-and-items/discovery.md) — アイテム側を本提案で解決する
- [0010: item groups](../0010-item-groups/proposal.md) — アイテムCRUDを本提案へ先送りした元の議論
- worklog [0004-item-groups-crud](../../worklogs/0004-item-groups-crud/README.md) — 遷移先の不整合を記録
