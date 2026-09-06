# 趣旨と初期技術選定

## ステータス

確定。初期実装に必要な目的、スコープ、主要技術、Google Cloud の利用サービスおよびリクエストフローを定義した。

状態管理や API のエラー形式など、現時点で保留した事項は後続トピックで扱う。

## 趣旨

- マンガの読書状況を保存・整理する小規模な Web アプリケーションを開発する。
- 開発者自身が実際に使用する。
- 開発を通じた知見の獲得と蓄積を主目的とする。
- 主な利用者は開発者一人だが、知見獲得のためマルチユーザー対応とする。
- Google アカウントを持つ任意のユーザーが利用できる。ただし、利用者の募集や広報は行わない。
- Google Cloud の無料枠範囲内で継続運用し、想定する小規模利用ではランニングコスト 0 円を目指す。

無料枠の超過や料金改定による課金の可能性は残る。「課金が技術的に一切発生しない」という意味ではない。

## 初期スコープ

### 機能

- ユーザーは「マンガ喫茶」「購入済み」などのグループを作成する。
- 作成したグループの中へアイテムを追加する UX とする。
- グループを作成、編集、削除できる。
- アイテムを作成、編集、削除できる。
- アイテムには次の情報を保存する。
  - タイトル
  - 読み終わった巻数
- アイテムは必ず 1 つのグループに所属する。
- 読み終わった巻数は 0 以上の整数とする。
- 同じグループ内でのタイトルの重複を許可する。
- 所属アイテムがあるグループを削除するときは確認を求め、承認後にグループと所属アイテムをまとめて削除する。
- 各ユーザーは自分のグループとアイテムだけを参照・変更できる。

### 初期スコープ外

- アイテムの別グループへの移動
- 検索
- ユーザーによる並べ替え
- グループの共有
- カスタムドメイン。初期版だけでなく、現時点では将来も使用しない想定とする。
- Google Cloud 上の独立した開発環境
- アカウント削除機能

一覧表示には作成日時による固定の順序を使用する。これはユーザーが操作する並べ替え機能には含めない。

## 技術選定

| 領域 | 採用技術・サービス |
| --- | --- |
| API | Go + chi + Huma |
| フロントエンド | React による SPA |
| 認証 UI | Google Identity Services |
| セッション | Firestore に保存する不透明なサーバーセッション |
| データベース | Firestore Standard edition / Native mode |
| 実行・静的ファイル配信 | Cloud Run |
| コンテナ保存 | Artifact Registry |
| CI/CD | Cloud Build |
| ログ | Cloud Logging |
| メトリクス・アラート | Cloud Monitoring / Cloud Billing |
| クラウド | Google Cloud |

Firebase Authentication、Firebase Hosting、Cloud CDN、外部 Application Load Balancer は使用しない。

CI/CD の Cloud Build 採用については、その妥当性を別トピックで再検討している（[CI/CD service selection](../0003-cicd-service-selection/discovery.md)）。

### 言語とバージョン方針

- Go は開発開始時点の最新安定版を使用する。
- React は開発開始時点の最新安定版を使用する。
- Node.js は開発開始時点の LTS 版を使用する。
- その他のライブラリは、互換性に問題のない開発開始時点の最新安定版を原則とする。
- Tailwind CSS v4 など明示的にメジャーバージョンを指定した依存関係は、その指定を優先する。
- 実際に採用したバージョンは Go のモジュール定義、Node.js のバージョン設定、`package.json` およびロックファイルで固定し、ビルドの再現性を確保する。

### フロントエンド

| 領域 | 選定 |
| --- | --- |
| パッケージマネージャー | pnpm |
| ビルドツール | Vite |
| 言語 | TypeScript |
| 状態管理 | 保留 |
| フォーム | 保留 |
| CSS | Tailwind CSS v4 |
| UI コンポーネント | shadcn/ui |

- Tailwind CSS ではセマンティックなデザイントークンを使用し、コンポーネントに具体的な色を直接指定することを避ける。
- 状態管理とフォームのライブラリは、画面構成と操作フローを定める後続トピックで決定する。

## システム構成

    GitHub main branch
           |
           v
      Cloud Build ------> Artifact Registry
           |                    |
           +--------------------+
                    |
                    v
    Browser ----> Cloud Run (Go + React SPA)
       |                  |
       |                  +----> Firestore
       |
       +------> Google Identity Services

- Cloud Run と Firestore は東京リージョン（`asia-northeast1`）に配置する。
- Google Cloud プロジェクトは本番用の 1 つだけを作成する。
- Cloud Run 標準の HTTPS 対応 `run.app` URL で公開する。
- Cloud Run サービスはインターネットから到達可能にし、アプリケーションの認証・認可は Go API が行う。
- React SPA のビルド済みファイルを Go のコンテナイメージに含める。
- SPA と API を同じ Cloud Run サービスから配信し、同一オリジンにする。
- API のパスは `/api/*` とする。
- SPA のアセットには長期キャッシュを設定し、`index.html` は再検証させる。
- `/api/*` 以外の SPA ルートに対する GET は `index.html` へフォールバックする。`/api/*` の不明なパスは JSON の 404 とする。

## Google Cloud の利用サービス

### Cloud Run

- Go API と React SPA を 1 つのコンテナで実行・配信する。
- リクエストベース課金を使用する。
- 最小インスタンス数を 0 として、未使用時はスケールゼロにする。
- 初期の最大インスタンス数は 1 とし、想定外アクセスによる費用の増加を抑える。
- 専用の実行サービスアカウントを割り当てる。

### Firestore

- Standard edition の `(default)` データベースを使用する。
- アプリケーションデータ、ローカルユーザー、セッションを保存する。
- ブラウザから Firestore へ直接アクセスさせない。
- Firestore TTL は課金対象となるため使用しない。

### Google Identity Services / Google Auth Platform

- Web 用 OAuth クライアントを作成する。
- 本番の `run.app` URL とローカル開発 URL を承認済み JavaScript 生成元へ登録する。
- OAuth 同意画面は外部ユーザー向けに公開し、Google アカウントを持つ任意のユーザーがログインできる状態にする。
- 認証には ID Token を使い、Google API へのアクセス権を求める追加スコープは使用しない。
- このフローでは OAuth クライアント ID を使用する。OAuth クライアントシークレットはブラウザにもコンテナにも配置しない。

### Cloud Build / Artifact Registry

- `main` ブランチへの反映を契機に Cloud Build を起動する。
- Cloud Build でフロントエンドをビルドし、その成果物を含む Go コンテナを作成する。
- コンテナイメージを東京リージョンの Artifact Registry へ保存する。
- ビルド成功後に Cloud Run へ自動デプロイする。
- Cloud Build のサービスアカウントには、Artifact Registry への書き込み、Cloud Run へのデプロイ、および実行サービスアカウントの利用に必要な最小限の権限だけを付与する。
- 古いコンテナイメージをクリーンアップポリシーで削除し、Artifact Registry の無料枠内に収める。

### Cloud Logging / Cloud Monitoring / Cloud Billing

- アプリケーションは標準出力へ構造化ログを出し、Cloud Logging で収集する。
- ID Token、セッション ID、Cookie、メールアドレスなどの認証情報・個人情報をログへ出さない。
- Cloud Run のリクエスト数、エラー率、レイテンシ、インスタンス数を Cloud Monitoring で確認できるようにする。
- 少額の予算と予算アラートを設定する。
- 予算アラートは通知であり、利用や課金を自動停止する上限ではない。

### IAM

- Cloud Run 用と Cloud Build 用のサービスアカウントを分離する。
- Cloud Run の実行サービスアカウントには Firestore の読み書きに必要な権限だけを付与する。
- Cloud Build のサービスアカウントにはビルドとデプロイに必要な権限だけを付与する。
- ユーザー管理のサービスアカウントキーは発行しない。

Secret Manager は初期構成では使用しない。将来シークレットが必要になった場合は、環境変数へ平文で置かず Secret Manager を導入する。

### Infrastructure as Code

- Google Cloud リソースの管理に Terraform を使用する。
- 対象リソースと Terraform state の保存方法は、インフラ設計の後続トピックで決定する。

## 認証フロー

1. ブラウザが Cloud Run から React SPA を取得する。
2. SPA が Google Identity Services を使って Google ログインを行う。
3. Google Identity Services が SPA へ Google ID Token を返す。
4. SPA が ID Token を JSON として `POST /api/auth/google` へ送信する。
5. Go API が Google の公開鍵による署名と `aud`、`iss`、`exp` を検証する。
6. API が `sub` を Google アカウントの不変かつ一意な識別子として取得する。
7. API が `sub` に対応するローカルユーザーを Firestore で照合する。
8. 初回ログインならユーザーを作成し、既存ユーザーならメールアドレス、表示名、プロフィール画像 URL を最新の値へ更新する。
9. API が暗号学的に安全な乱数からセッション ID を生成する。
10. API がセッション ID の SHA-256 ハッシュ、ユーザー ID、有効期限などを Firestore へ保存する。生のセッション ID は保存しない。
11. API が生のセッション ID を Cookie でブラウザへ返す。
12. 以後、ブラウザは同一オリジンの API リクエストへ Cookie を自動送信する。

Go API では Google が提供する検証ライブラリを使用し、公開鍵の取得・キャッシュ・更新を独自実装しない。

## セッション

- Cookie 名は `__Host-session` とする。
- Cookie に `Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/` を設定し、`Domain` は設定しない。
- セッションの有効期間は 30 日とする。
- 複数端末からの同時ログインを許可し、ログインごとに独立したセッションを作成する。
- ログアウト時は現在の端末のセッションだけを削除し、Cookie を失効させる。
- 期限切れセッションが提示された場合は、そのセッションを削除して未認証として扱う。
- ログイン時には同じユーザーの期限切れセッションも削除する。
- Firestore TTL と定期削除用の Cloud Scheduler は初期構成では使用しない。

状態変更を伴う API では、JSON だけを受け付け、`Origin` がアプリケーション自身のオリジンと一致することを検証する。同一オリジン構成、SameSite Cookie、Origin 検証を組み合わせて CSRF を防ぐ。

## 通常の API リクエストフロー

1. ブラウザが `__Host-session` Cookie を付けて `/api/*` へリクエストする。
2. 認証ミドルウェアがセッション ID を SHA-256 でハッシュする。
3. ハッシュをドキュメント ID として Firestore のセッションを直接取得する。
4. セッションの存在と有効期限を確認し、ユーザー ID をリクエストコンテキストへ格納する。
5. ハンドラーはリクエストパラメーターではなく、認証済みコンテキストのユーザー ID から Firestore のパスを組み立てる。
6. API が対象ユーザーのデータだけを読み書きして結果を返す。

## Firestore データモデル

    users/{googleSub}
      email: string
      displayName: string
      pictureUrl: string
      createdAt: timestamp
      updatedAt: timestamp

    users/{googleSub}/groups/{groupId}
      name: string
      createdAt: timestamp
      updatedAt: timestamp

    users/{googleSub}/groups/{groupId}/items/{itemId}
      title: string
      completedVolume: integer
      createdAt: timestamp
      updatedAt: timestamp

    sessions/{sha256(sessionId)}
      userId: string
      createdAt: timestamp
      expiresAt: timestamp

- ローカルユーザー ID には Google の `sub` を使用する。メールアドレスは変更され得るため、識別子には使わない。
- ユーザーにはメールアドレス、表示名、プロフィール画像 URL を保存する。
- グループ ID とアイテム ID はサーバー側で生成する。
- グループとアイテムをユーザー配下へ置き、所有者境界をドキュメントパスで表現する。
- Firestore のクライアント向け Security Rules は全面拒否とし、Cloud Run のサーバー SDK だけが IAM によりアクセスする。
- グループ削除時、API は配下のアイテムを削除してからグループを削除する。処理は再試行しても安全になるよう実装する。

## 初期 API

| Method | Path | 用途 |
| --- | --- | --- |
| POST | `/api/auth/google` | Google ID Token の検証、ユーザーの作成・更新、セッション発行 |
| POST | `/api/auth/logout` | 現在のセッションの削除 |
| GET | `/api/me` | ログイン中のユーザー情報の取得 |
| GET | `/api/groups` | グループ一覧の取得 |
| POST | `/api/groups` | グループの作成 |
| PATCH | `/api/groups/{groupId}` | グループ名の変更 |
| DELETE | `/api/groups/{groupId}` | グループと所属アイテムの削除 |
| GET | `/api/groups/{groupId}/items` | 所属アイテム一覧の取得 |
| POST | `/api/groups/{groupId}/items` | アイテムの作成 |
| PATCH | `/api/groups/{groupId}/items/{itemId}` | アイテムの変更 |
| DELETE | `/api/groups/{groupId}/items/{itemId}` | アイテムの削除 |

Huma が生成する OpenAPI を API 契約の正本とする。

- アイテムのタイトルは 100 文字以下とし、フロントエンドと API の両方で検証する。
- アイテム一覧 API にはページネーションを設ける。
- ページネーションの方式、ページサイズ、グループ名の文字数上限、統一エラー形式は API 設計の後続トピックで決定する。

## ローカル開発

- Go API、React 開発サーバー、Firestore エミュレーターをローカルで実行する。
- ローカル開発用 URL を Google Identity Services の承認済み JavaScript 生成元へ登録する。
- 開発データは Firestore エミュレーターに保存し、本番データと分離する。
- Google Cloud 上の開発環境が必要になった場合は、本番と同じプロジェクトへ混在させず、別プロジェクトを作成する。

## 0 円運用の方針

- Cloud Run はリクエストベース課金、最小インスタンス 0、最大インスタンス 1 とする。
- Firestore は無料枠を持つ `(default)` データベースだけを使用する。
- Firestore TTL、バックアップ、PITR、名前付きデータベースは初期構成で使用しない。
- Cloud Build の無料ビルド時間内に収める。
- Artifact Registry の保存容量をクリーンアップポリシーで抑える。
- Cloud CDN、外部 Application Load Balancer、Cloud Scheduler は使用しない。
- ログ量を制御し、デバッグログを本番で常時大量に出さない。
- 請求先アカウントに少額の予算アラートを設定する。
- 無料枠と料金は変更され得るため、実装・公開時に公式料金表を再確認する。

## データ保護方針

- 初期構成では Firestore のバックアップ、PITR、定期エクスポートを実施しない。
- 障害や操作ミスによるデータ喪失を復旧できない可能性を受容する。

## 後続トピックで決めること

- 状態管理ライブラリ
- フォームライブラリ
- グループ名の文字数上限
- アイテム一覧のページネーション方式とページサイズ
- API の統一エラー形式
- 画面構成と操作フロー
- テスト戦略
- Terraform で管理するリソースの範囲と state の保存方法
- Firestore のインデックス
- 独立した Google Cloud 開発環境の導入条件

## 参考資料

- [Cloud Run の料金](https://cloud.google.com/run/pricing)
- [Firestore の料金](https://cloud.google.com/firestore/pricing)
- [Cloud Build の料金](https://cloud.google.com/build/pricing)
- [Artifact Registry の料金](https://cloud.google.com/artifact-registry/pricing)
- [Google ID Token のバックエンド検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
