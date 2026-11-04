# The deterministic default URL is canonical (APP_ORIGIN carries it). Cloud Run
# also assigns a legacy hash URL (*.a.run.app) to the same service, and .uri
# still reports that form, so select the deterministic one out of `urls`.
# one() yields null for zero matches and fails loudly if more than one
# non-.a.run.app URL ever appears.
output "cloud_run_url" {
  description = "The deterministic default URL of the service, https://<service>-<project-number>.<region>.run.app — the canonical origin APP_ORIGIN carries. Cloud Run also assigns a legacy hash URL (*.a.run.app) to the same service; SPA GET/HEAD requests arriving there are redirected here. .uri still reports the legacy form, so it is not used."
  value       = one([for url in google_cloud_run_v2_service.app.urls : url if !endswith(url, ".a.run.app")])
}
