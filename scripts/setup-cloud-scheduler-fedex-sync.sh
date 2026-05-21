#!/usr/bin/env bash
set -euo pipefail

CLOUD_RUN_PROJECT="${CLOUD_RUN_PROJECT:-ready-route-project}"
CLOUD_SCHEDULER_LOCATION="${CLOUD_SCHEDULER_LOCATION:-us-west1}"
SYNC_BASE_URL="${SYNC_BASE_URL:-https://api.readyroute.org/internal/fedex-sync}"
MANIFEST_JOB_NAME="${MANIFEST_JOB_NAME:-readyroute-fedex-sync-manifests}"
PROGRESS_JOB_NAME="${PROGRESS_JOB_NAME:-readyroute-fedex-sync-progress}"
MANIFEST_SCHEDULE="${MANIFEST_SCHEDULE:-*/5 * * * *}"
PROGRESS_SCHEDULE="${PROGRESS_SCHEDULE:-*/2 * * * *}"
SCHEDULER_TIME_ZONE="${SCHEDULER_TIME_ZONE:-America/Los_Angeles}"

if [[ -z "${FEDEX_SYNC_WORKER_SECRET:-}" ]]; then
  echo "FEDEX_SYNC_WORKER_SECRET is required."
  echo "Run: read -s FEDEX_SYNC_WORKER_SECRET && export FEDEX_SYNC_WORKER_SECRET"
  exit 1
fi

gcloud config set project "$CLOUD_RUN_PROJECT"
gcloud services enable cloudscheduler.googleapis.com

upsert_job() {
  local job_name="$1"
  local mode="$2"
  local schedule="$3"
  local body="{\"mode\":\"$mode\"}"

  if gcloud scheduler jobs describe "$job_name" \
    --location "$CLOUD_SCHEDULER_LOCATION" >/dev/null 2>&1; then
    echo "==> Updating Cloud Scheduler job: $job_name"
    gcloud scheduler jobs update http "$job_name" \
      --location "$CLOUD_SCHEDULER_LOCATION" \
      --schedule "$schedule" \
      --time-zone "$SCHEDULER_TIME_ZONE" \
      --uri "$SYNC_BASE_URL" \
      --http-method POST \
      --headers "x-readyroute-worker-secret=$FEDEX_SYNC_WORKER_SECRET,Content-Type=application/json" \
      --message-body "$body"
  else
    echo "==> Creating Cloud Scheduler job: $job_name"
    gcloud scheduler jobs create http "$job_name" \
      --location "$CLOUD_SCHEDULER_LOCATION" \
      --schedule "$schedule" \
      --time-zone "$SCHEDULER_TIME_ZONE" \
      --uri "$SYNC_BASE_URL" \
      --http-method POST \
      --headers "x-readyroute-worker-secret=$FEDEX_SYNC_WORKER_SECRET,Content-Type=application/json" \
      --message-body "$body"
  fi
}

upsert_job "$MANIFEST_JOB_NAME" "manifests" "$MANIFEST_SCHEDULE"
upsert_job "$PROGRESS_JOB_NAME" "progress" "$PROGRESS_SCHEDULE"

echo "==> Cloud Scheduler FedEx sync jobs are configured."
echo "==> Test manually with:"
echo "gcloud scheduler jobs run $MANIFEST_JOB_NAME --location $CLOUD_SCHEDULER_LOCATION"
echo "gcloud scheduler jobs run $PROGRESS_JOB_NAME --location $CLOUD_SCHEDULER_LOCATION"
