# Ollama privado para Cathy: los modelos quedan horneados en la imagen
# para que el cold start no dependa de descargar ~7 GB desde internet.
FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:8080 \
    OLLAMA_MODELS=/models \
    OLLAMA_DEBUG=false \
    OLLAMA_KEEP_ALIVE=-1 \
    OLLAMA_MAX_LOADED_MODELS=2 \
    OLLAMA_NUM_PARALLEL=2

ARG MODELS="gemma4:e2b-it-qat qwen3.5:2b"
RUN ollama serve & sleep 5 && \
    for m in $MODELS; do ollama pull "$m" || exit 1; done && \
    ollama list

ENTRYPOINT ["ollama", "serve"]
