output "state_bucket_name" {
  description = "GCS bucket for remote Terraform state. Referenced verbatim in infra/prod/backend.tf (backends cannot interpolate)."
  value       = google_storage_bucket.tfstate.name
}

output "deployer_service_account_email" {
  description = "Dormant deploy identity. No role bindings yet."
  value       = google_service_account.deployer.email
}

output "enabled_services" {
  description = "APIs enabled on the project by this layer."
  value       = sort([for s in google_project_service.enabled : s.service])
}
