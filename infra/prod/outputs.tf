output "artifact_registry_repository" {
  description = "Docker path prefix for pushed images. Append \"/<image>:<tag>\" (image is \"app\", tag is the short commit SHA)."
  value       = "${google_artifact_registry_repository.app.location}-docker.pkg.dev/${google_artifact_registry_repository.app.project}/${google_artifact_registry_repository.app.repository_id}"
}
