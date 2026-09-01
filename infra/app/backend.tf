terraform {
  # Bucket created by infra/bootstrap/ (google_storage_bucket.tfstate,
  # "<project_id>-tfstate"). Backends cannot interpolate, so the name is
  # written out here. New prefix; the retired "prod" prefix is not reused
  # (discussion 0027).
  backend "gcs" {
    bucket = "siorie-tfstate"
    prefix = "app"
  }
}
