# 議事録

## 経緯

`discovery.md` は frontmatter 無しだったので内容から推定して補完（`date: 2026-09-01` /
`tags: [infra, iac, terraform, deploy, firestore]` / `status: open`）。ディレクトリを
`0027` から `0027-firestore-and-infra-deploy-layers` にリネーム。

## 前提の確認（エージェントから指摘）

- 「デプロイ単位を頻度で割る」＝ `infra/prod/` をさらに分割する案は **decision 0011 で
  一度見送られている**。0011 は「flat 2ルートモジュール、`modules/` も `environments/`
  も作らない。factor out は second environment か real reuse ができてから」（0001 の
  no-speculative-structure ルール由来）。proposal 0024 も「新レイヤーは作らない」と明記。
- 見送りの根拠は「まだ具体的な必要がない」。関連する open discovery に 0026（`infra/prod/`
  に何か足すたび `-var` 2つ必須）、0025（`APP_ORIGIN` を実 URL から取れない）がある。
- Firestore は見送りではなく予定どおり（0011・0024 が「later worklog」と明記）。
  worklog 0013 の preflight で `(default)` 未作成を確認済み → 新規作成、import 不要。

## 質問と回答

### 第1ラウンド

1. **動機と 0026 との関係** → 予防的整理。0026 と 0027 の関係は気にしない（統合か併存かは
   判断しない）。
2. **分割の形**（A: 2層のまま Cloud Run を `infra/app/` へ ／ B: 3層に命名し直す
   `bootstrap` / `platform` / `app`、`prod` 名は廃止 ／ C: 層を増やさず `image_tag` だけ
   別管理）→ **B**。
3. **Firestore の確定事項** → すべて承認：
   - ロケーション `asia-northeast1` 単一リージョン（永久に変更不可、マルチリージョンは過剰）
   - モード `FIRESTORE_NATIVE`
   - 削除保護（GCP 側）＋ `lifecycle { prevent_destroy = true }`
   - セキュリティルール／複合インデックスのリソースは入れない（アクセスは Go バックエンドの
     ADC 経由のみ）
   - `roles/datastore.user` を runtime SA に付与、`platform` 層

### 第2ラウンド

1. **`app` → `platform` の値の受け渡し**（a: `terraform_remote_state` ／ b: `data` source
   で GCP から直接 ／ c: 決定的文字列をハードコード）→ **b**。
2. **既存リソースの移設と state prefix**（`prod/` prefix 流用 ／ 新規 prefix + 全 import）
   → **全インポート**（新 prefix `platform/` `app/`、`prod/` は破棄）。
3. **`google_client_id` の置き場所**（a: `app/terraform.tfvars` にコミット ／ b: default
   なし `-var` のまま）→ **b**。

## 採用しなかった案と理由

- **flat 2層を維持（decision 0011 のまま）** — 予防的整理として層を割ることを選択。0011 /
  0001 の no-speculative-structure とのテンションは承知のうえ。決着時に 0011 を更新する新
  decision を起こす。
- **分割案 A（`prod` を土台名のまま残し Cloud Run だけ `infra/app/` へ）** — 頻度の段が
  土台・アプリの2つだけになり、`bootstrap` を含む3段構造が名前に出ない。B の明示的な3層
  命名を選択。
- **分割案 C（層を増やさず `image_tag` を別管理）** — 0026 の摩擦だけを狙う対症。頻度で
  層を割る本来の目的（apply の blast radius・plan 対象の分離）には届かない。
- **`terraform_remote_state` で層間連携** — `app` の plan に `platform` state の読み取り
  権限と outputs 整備が要る。`data` source なら通常の GCP 読み取り権限だけで済む。
- **決定的文字列をハードコード** — AR パスと SA email の知識を2層で二重持ちになる。
- **`prod/` state prefix を `platform` に流用** — 移設は減るが名前が古いまま残る。全 import
  で綺麗な prefix を選択。
- **`google_client_id` を `app/terraform.tfvars` にコミット** — `app` の `-var` が
  `image_tag` だけになるが、「リポに値を置かない」方針（0024 / 0026）を崩す。default なし
  `-var` を維持。
- **0026 を 0027 に統合 / dropped 化** — ユーザーが関係を気にしないと明言。0025・0026 は
  open のまま残す。

## 申し送り

- `/decide` 時に decision 0011 を更新する新 decision が必要（変更頻度 / blast radius を
  factor-out の trigger に追加、flat 2層方針の撤回、`prod` → `platform` + `app`）。
- `APP_ORIGIN` の実 URL 化は 0025 の担当。分割で `app` 層内に閉じて対処しやすくなる。
- 予算・監視・AR の DELETE クリーンアップポリシーは 0024 の申し送りどおり後続。`platform`
  層に入る見込み。
