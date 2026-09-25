#!/usr/bin/env bash
# Construye y despliega Ollama privado (GPU L4) en Cloud Run.
# Uso: ./deploy.sh            (usa PROJECT/REGION por defecto)
set -euo pipefail

PROJECT="${PROJECT:-ai-experiments-487722}"
# europe-west4: la región donde el proyecto tiene cuota de L4 sin redundancia zonal.
REGION="${REGION:-europe-west4}"
# La imagen vive en Artifact Registry de us-central1 (Cloud Run la jala entre regiones).
AR_REGION="${AR_REGION:-us-central1}"
REPO="${REPO:-coverletter}"
SERVICE="${SERVICE:-ollama-coverletter}"
IMAGE="${AR_REGION}-docker.pkg.dev/${PROJECT}/${REPO}/ollama:latest"

gcloud artifacts repositories describe "$REPO" --location "$AR_REGION" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format docker --location "$AR_REGION" --project "$PROJECT"

gcloud builds submit . --project "$PROJECT" --region "$AR_REGION" \
  --config cloudbuild.yaml --substitutions "_IMAGE=${IMAGE}"

# GPU=1 (default) usa una L4; GPU=0 despliega solo con CPU (plan B cuando el
# proyecto no tiene cuota de GPU: los modelos pequeños corren a ~15-20 tok/s).
GPU="${GPU:-1}"
GPU_FLAGS=()
if [[ "$GPU" == "1" ]]; then
  GPU_FLAGS=(--gpu 1 --gpu-type nvidia-l4 --no-gpu-zonal-redundancy)
fi

gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" \
  ${GPU_FLAGS[@]+"${GPU_FLAGS[@]}"} \
  --cpu 8 --memory 32Gi --no-cpu-throttling \
  --min-instances 0 --max-instances 1 --concurrency 4 --timeout 900 \
  --no-allow-unauthenticated

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
