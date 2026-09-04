output "state_bucket_name" {
  description = "GCS bucket for remote Terraform state. Referenced verbatim in infra/platform/backend.tf and infra/app/backend.tf (backends cannot interpolate)."
  value       = google_storage_bucket.tfstate.name
}

output "deployer_service_account_email" {
  description = "Deploy identity impersonated by GitHub Actions through Workload Identity Federation. Copied verbatim into .github/workflows/deploy.yml (google-github-actions/auth `service_account`). Its roles are granted in infra/platform/."
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Full resource name of the GitHub Actions OIDC provider. Copied verbatim into .github/workflows/deploy.yml (google-github-actions/auth `workload_identity_provider`)."
  value       = google_iam_workload_identity_pool_provider.github_actions.name
}

output "enabled_services" {
  description = "APIs enabled on the project by this layer."
  value       = sort([for s in google_project_service.enabled : s.service])
}
