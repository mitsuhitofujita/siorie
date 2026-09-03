# 0015: Cloud Run service, public invoker, and a dormant runtime SA

Discussion: [Cloud Run service and a super-minimal connectivity check](../discussions/0024-cloud-run-service/proposal.md)
Worklog: [Cloud Run service and dormant runtime SA](../worklogs/0013-cloud-run-service/plan.md)

## Status

Accepted; applied by the operator on 2026-08-30 and reachable at
`https://siorie-u6y3wdsaua-an.a.run.app`.

The **layer placement** decided here (everything in `infra/prod/`) is superseded
by [0014](0014-infra-deploy-layers-and-firestore.md): the service and its
invoker now belong in `infra/app/`, the runtime SA in `infra/platform/`. The
resource shapes below are unchanged by that move.

The **`APP_ORIGIN` construction** decided here (built from the project number)
is superseded by [0016](0016-spa-co-serving.md): the operator now passes the
service's real URL as a default-less `app_origin` variable.

## Decision

- **`google_cloud_run_v2_service`** (the v2 resource, not v1
  `google_cloud_run_service`), `name = "siorie"`, `ingress =
  "INGRESS_TRAFFIC_ALL"`, `deletion_protection = false` (the provider default is
  `true`; the service holds no data and is recreated from a published image in
  one apply). `template.scaling { min_instance_count = 0, max_instance_count = 1 }`,
  request-based billing left at the v2 default. One container from
  `<artifact-registry-path>/app:${var.image_tag}` on `container_port = 8080`
  (`PORT` is injected by Cloud Run, not set). Env: `GOOGLE_CLIENT_ID`,
  `APP_ORIGIN`, `FIRESTORE_PROJECT_ID` — the three the Go server requires or it
  `log.Fatalf`s at startup.

- **Public, unauthenticated reach**: `google_cloud_run_v2_service_iam_member`,
  `roles/run.invoker` → `allUsers`. Per [0001](0001-monorepo-scaffold.md) the
  service is internet-reachable and the Go API is the authorization boundary.
  No organization and no `iam.allowedPolicyMemberDomains` policy on the account,
  so `allUsers` is accepted.

- **Dormant `siorie-run` runtime service account** — identity (email) reserved
  now, **no IAM role bindings**, mirroring `infra/bootstrap/`'s `deployer` SA.
  `roles/datastore.user` was deferred to the Firestore round (granted in
  [0014](0014-infra-deploy-layers-and-firestore.md)).

- **`image_tag` and `google_client_id` are default-less Terraform variables**,
  passed with `-var` / `TF_VAR_` at plan/apply time. `google_client_id` is
  non-secret but still kept out of the repository. `outputs.tf` exposes
  `cloud_run_url = ...app.uri`.

- **`APP_ORIGIN` is built as `https://siorie-<project number>.<region>.run.app`**
  from `data.google_project`, because a resource cannot self-reference its own
  `.uri`, and a constructed value keeps this to a single apply. **This is wrong
  for this project** — it issues the legacy `<name>-<hash>-<region-code>.a.run.app`
  form, so the env value does not match the real URL. Harmless at this scope
  (`GET /api/hello` runs no `Origin` check); the real fix is
  [discussion 0025](../discussions/0025-cloud-run-app-origin/discovery.md), still
  open.

- **Scope was a super-minimal connectivity check** — `curl <url>/api/hello`
  returns `200` JSON. The Firestore `(default)` database, runtime IAM, SPA
  co-serving, the Artifact Registry DELETE cleanup policy, the billing budget,
  Cloud Monitoring, and CI/CD were all deferred. `apply` and the check are
  operator-run: the auto-mode classifier blocks `terraform apply` for the
  non-bootstrap layers.

## Rationale

The v2 resource is the current API surface and needs no v1 compatibility.
`allUsers` invoker is the intended end state (authz lives in the app) and
nothing on the account blocks it. Reserving the runtime SA without bindings
fixes its email for later rounds without granting anything or issuing a key.
Default-less variables keep both IDs out of git at the cost of two mandatory
`-var` flags on every operation. Building `APP_ORIGIN` from the project number
was chosen to avoid a two-phase apply; the bet was that this project uses the
newer deterministic URL scheme, which it does not — so the value is a placeholder
until 0025 is settled.

## Follow-ups still open

- [0025 Cloud Run app origin](../discussions/0025-cloud-run-app-origin/discovery.md)
  — how the service learns its real public origin; `APP_ORIGIN` is wrong in
  production until this lands. Not fixed by 0014.
- [0026 Infra per-deploy inputs](../discussions/0026-infra-per-deploy-inputs/discovery.md)
  — where non-secret per-deploy inputs live; 0014 narrowed the friction to the
  `app` layer but did not resolve it.
