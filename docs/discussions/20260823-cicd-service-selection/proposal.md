# CI/CD サービス選定

## ステータス

保留。Cloud Build の採用を撤回し、CI/CD サービスの選定は IaC（Terraform）・デプロイ設計を検討する後続トピックへ先送りする。
本ドキュメントは決定ではなく、先送りに至った検討の記録である。

## 背景

[purpose and initial tech stack](../20260823-purpose-and-initial-tech-stack/proposal.md) では CI/CD に Cloud Build を採用しているが、
これは GCP のサービスに一通り寄せる初期方針の中で決まったものであり、CI/CD サービスとしての比較検討を経たものではなかった。
この既定路線化に対する懸念から、本トピックで妥当性を再検討した。

## 検討した内容

比較のたたき台として Cloud Build と GitHub Actions を検討した。

| 観点 | Cloud Build | GitHub Actions |
| --- | --- | --- |
| トリガー設定の所在 | GCP コンソールでのリポジトリ接続（リポジトリ外） | `.github/workflows/`（リポジトリ内） |
| GCP への認証 | Cloud Build 専用サービスアカウント | Workload Identity Federation（新規設定が必要） |
| コスト | 無料枠が 1 日 120 build-minutes に制限される | public リポジトリでは無料枠が実質無制限 |
| プルリクエスト検証 | デプロイ用トリガーとは別に設計が必要 | 同一ワークフロー内で扱いやすい |

このリポジトリは GitHub 上で public であるため、GitHub Actions の無料枠に関する制約は事実上ない。

discovery.md で例に挙がった AWS CodeCommit は、ソースコード管理サービスであり CI/CD サービスではない。
比較対象として Cloud Build と並べるのは筋が違う。また、このリポジトリは AWS を利用していないため、直接の代替候補にもならない。

## 決定しないことにした理由

比較検討は行ったが、この提案ではどちらかを確定させない。

- IaC（Terraform）による Google Cloud リソース管理の方式や、コンテナビルド・Cloud Run デプロイの具体的な手順がまだ決まっていない。CI/CD サービスはこれらと密接に関わるため、単独で先に決めると手戻りの可能性がある。
- 知見の獲得は本プロジェクトの目的の一つだが、目的なく特定サービスを使うこと自体を選定理由にはしない。

ハイブリッド構成（トリガーは GitHub Actions、ビルド・デプロイは Cloud Build に任せる）は検討対象から除外した。
Cloud Build を使うか使わないかの二択で判断する方針としたため。

## 今後の扱い

- CI/CD サービスの選定は、IaC・デプロイ設計を検討する後続トピックで、本提案の比較観点を踏まえて決定する。
- [purpose and initial tech stack](../20260823-purpose-and-initial-tech-stack/proposal.md) の技術選定表・システム構成図は、当時の判断の記録として変更しない。CI/CD サービスの実際の採用技術は、後続トピックの proposal および decisions を正とする。

## 参考資料

- [GitHub Actions の課金について](https://docs.github.com/ja/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
- [Cloud Build の料金](https://cloud.google.com/build/pricing)
