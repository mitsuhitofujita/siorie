output "artifact_registry_repository" {
  description = "Docker path prefix for pushed images. Append \"/<image>:<tag>\" (image is \"app\", tag is the short commit SHA)."
  value       = "${google_artifact_registry_repository.app.location}-docker.pkg.dev/${google_artifact_registry_repository.app.project}/${google_artifact_registry_repository.app.repository_id}"
}

output "cloud_run_url" {
  description = "The URL Cloud Run assigned to the service. Connectivity-check target, and the value to compare against the APP_ORIGIN built from the project number."
  value       = google_cloud_run_v2_service.app.uri
}
