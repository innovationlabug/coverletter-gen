import { DEFAULT_MODEL, MODELS, isModelId } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Configuración de runtime para la UI (el env de Cloud Run no existe en build time). */
export function GET() {
  const envModel = process.env.OLLAMA_MODEL;
  return Response.json({
    defaultModel: isModelId(envModel) ? envModel : DEFAULT_MODEL,
    models: MODELS,
    ollamaConfigured: Boolean(process.env.OLLAMA_URL),
    ollamaKind: process.env.OLLAMA_URL?.startsWith("https://") ? "cloud-run" : process.env.OLLAMA_URL ? "local" : "none",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  });
}
