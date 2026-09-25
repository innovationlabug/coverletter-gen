#!/usr/bin/env bash
# Despliega la app de Cathy (Next.js) en Cloud Run, con su propia cuenta de servicio.
#   ./deploy-app.sh                        # valores por defecto
#   OLLAMA_MODEL=qwen3.5:2b ./deploy-app.sh
# Requisitos: gcloud autenticado con permisos de admin en el proyecto; el servicio
# ollama-coverletter ya desplegado (ver ollama/deploy.sh). No usa API keys: Gemini va por
# Vertex AI con la cuenta de servicio, y Ollama se invoca con un ID token de esa misma cuenta.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="${PROJECT:-ai-experiments-487722}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-coverletter}"
SERVICE="${SERVICE:-cathy-coverletter}"
OLLAMA_SERVICE="${OLLAMA_SERVICE:-ollama-coverletter}"
# Ollama vive donde hay cuota de GPU L4 (europe-west4); la app puede estar en otra región.
OLLAMA_REGION="${OLLAMA_REGION:-europe-west4}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b-it-qat}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"
SA_NAME="coverletter-cathy-app"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/cathy-app:$(date +%Y%m%d-%H%M%S)"

echo "» APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com iamcredentials.googleapis.com --project "$PROJECT"

echo "» Cuenta de servicio ${SA_EMAIL}"
gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name "Cathy coverletter app (Vertex AI + invoker de Ollama)"

# Una cuenta de servicio recién creada tarda unos segundos en ser visible para IAM
# (consistencia eventual): reintentamos en vez de fallar a la primera.
retry() {
  local n=0
  until "$@"; do
    n=$((n + 1))
    [ "$n" -ge 6 ] && return 1
    echo "  (reintentando en 10 s: la cuenta de servicio aún se está propagando)"
    sleep 10
  done
}

echo "» roles/aiplatform.user en el proyecto (Gemini vía Vertex AI)"
retry gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA_EMAIL}" --role roles/aiplatform.user --condition=None >/dev/null

echo "» roles/run.invoker SOLO sobre ${OLLAMA_SERVICE} (no en todo el proyecto)"
retry gcloud run services add-iam-policy-binding "$OLLAMA_SERVICE" --project "$PROJECT" --region "$OLLAMA_REGION" \
  --member "serviceAccount:${SA_EMAIL}" --role roles/run.invoker >/dev/null

OLLAMA_URL="$(gcloud run services describe "$OLLAMA_SERVICE" --project "$PROJECT" --region "$OLLAMA_REGION" --format 'value(status.url)')"
[ -n "$OLLAMA_URL" ] || { echo "No encontré ${OLLAMA_SERVICE}; despliégalo primero (ollama/deploy.sh)"; exit 1; }
echo "  OLLAMA_URL=${OLLAMA_URL}"

echo "» Artifact Registry ${REPO}"
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" --project "$PROJECT"

echo "» Cloud Build → ${IMAGE}"
gcloud builds submit . --project "$PROJECT" --region "$REGION" --tag "$IMAGE"

echo "» Cloud Run ${SERVICE}"
# --timeout 600: el cold start de Ollama (GPU ~30–60 s; CPU hasta ~2 min) + generación.
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --cpu 1 --memory 1Gi --min-instances 0 --max-instances 3 --concurrency 40 --timeout 600 \
  --set-env-vars "OLLAMA_URL=${OLLAMA_URL},OLLAMA_MODEL=${OLLAMA_MODEL},GEMINI_MODEL=${GEMINI_MODEL},GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true"

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
