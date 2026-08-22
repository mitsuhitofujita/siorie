# 趣旨の設定

## 前提

このリポジトリでは、小規模なWebアプリケーションを開発する。
このWebアプリケーションは実際に私が使用する。
開発を通して、私の知見とすることが目的。
知見の蓄積が目的なので、技術選定はある程度決まっている。
さらに、実質私しか使用しない想定なので、ランニングコストは無料枠を使用し0円が可能となるようにする。
私しか使用しないが、知見の蓄積が目的なので、マルチユーザーでも動作するようにする。
API: go+chi+Huma
Frontend: react(SPA)
クラウドプラットフォーム: Google Cloud
APIホスト: Cloud Run
認証: Google認証
データベース: Firestore
フロントエンドで認証し、APIで情報の確認し、セッションを振り出す。

## ゴール

初期の技術選定を完了する。
今は決めないことが合っても良い。
主要なGoogle Cloudの利用サービスとフローを定義する。
結果を`topics/01-趣旨の設定/draft.md`にまとめる。

## やりとり

1.
「タイトル」「読み終わった巻数」を保存する。
「マンガ喫茶」や「購入済み」などのカテゴリでグループ分けできる。
むしろ、グループを作り、アイテム情報を追加するUXとする。

2.
任意のGoogleユーザーを許可。
Google認証でログすれば誰でも使える状態。
しかし、使用を呼びかけたりはしない。

3.
フロントエンドの静的ファイルホストはCloud CDNを使用する。
Firebaseではなく、Google Cloudに寄せる構成にしたい。
Browser
  │
  ▼
Google Identity Services
  │
  │ Google ID Token
  ▼
POST /api/auth/google
  │
  ▼
Go Backend
  │
  ├─ Google署名検証
  ├─ aud / iss / exp検証
  ├─ sub取得
  ├─ Local User照合
  └─ Session生成
  │
  ▼
Firestore

1.
0円運用を優先し、Cloud RunからSPAとAPIを同一オリジンで配信する

2.
はい

3.
「アイテムを別グループへ移動可能」はスコープ外

1. はい。
2. プロフィール画像(URL)も保存します。
3. はい。課金対象となるFirestore TTL機能は使用しません。


今答えられるものは答えます。
`topics/01-趣旨の設定/draft.md`に反映してください。

- Go、React、Node.js および各ライブラリのバージョン
Go: latest
React: latest
Node.js: lts

- React のビルドツール、TypeScript、状態管理、フォーム、CSS の選択
パッケージマネージャー: pnpm
ビルドツール: vite
言語: TypeScript
状態管理:まだ決めない
フォーム: まだ決めない
CSS: TailwindCSS v4(セマンティクス使用)、shadcn/UI使用

- リクエスト・フィールドの文字数上限とページネーション
文字数上限: タイトル:100文字
ページネーション: アイテム一覧に必要

- API の統一エラー形式
あとで決める

- 画面構成と操作フロー
後続トピックス

- テスト戦略
あとで決める

- Infrastructure as Code の採否とツール
Terraformを利用

- Firestore のインデックス
後から考える

- バックアップ、復旧、データエクスポート
しない

- カスタムドメインおよび独立した Google Cloud 開発環境の導入条件
カスタムドメインは使用しない想定
