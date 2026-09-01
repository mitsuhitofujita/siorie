output "cloud_run_url" {
  description = "The URL Cloud Run assigned to the service. Connectivity-check target, and the value APP_ORIGIN should eventually carry (discussion 0025)."
  value       = google_cloud_run_v2_service.app.uri
}
