terraform {
  # Bucket created by infra/bootstrap/ (google_storage_bucket.tfstate,
  # "<project_id>-tfstate"). Backends cannot interpolate, so the name is
  # written out here.
  backend "gcs" {
    bucket = "siorie-tfstate"
    prefix = "prod"
  }
}
