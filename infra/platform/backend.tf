terraform {
  # Bucket created by infra/bootstrap/ (google_storage_bucket.tfstate,
  # "<project_id>-tfstate"). Backends cannot interpolate, so the name is
  # written out here. This layer's state is a new prefix; it does not reuse
  # the retired "prod" prefix (discussion 0027).
  backend "gcs" {
    bucket = "siorie-tfstate"
    prefix = "platform"
  }
}
