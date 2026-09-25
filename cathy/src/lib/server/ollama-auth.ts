import "server-only";
import { GoogleAuth, type IdTokenClient } from "google-auth-library";

/**
 * Autenticación hacia el Ollama privado.
 * - http://localhost:11434 (ollama serve o `gcloud run services proxy`) → sin auth.
 * - https://…run.app (Cloud Run con --no-allow-unauthenticated) → ID token cuyo audience es
 *   la URL del servicio. En Cloud Run lo emite el metadata server para la cuenta de servicio
 *   de la app (que tiene roles/run.invoker sobre ollama-coverletter).
 * - OLLAMA_TOKEN (solo desarrollo): un token de `gcloud auth print-identity-token`, porque
 *   las credenciales de usuario (ADC) no pueden emitir ID tokens con google-auth-library.
 */
let clientPromise: Promise<IdTokenClient> | null = null;
let clientAudience = "";

export async function ollamaAuthHeaders(ollamaUrl: string): Promise<Record<string, string>> {
  if (process.env.OLLAMA_TOKEN) return { Authorization: `Bearer ${process.env.OLLAMA_TOKEN}` };
  const url = new URL(ollamaUrl);
  if (url.protocol !== "https:") return {};
  const audience = url.origin;
  if (!clientPromise || clientAudience !== audience) {
    clientAudience = audience;
    clientPromise = new GoogleAuth().getIdTokenClient(audience);
  }
  const client = await clientPromise;
  const headers = await client.getRequestHeaders(audience);
  const authz = headers.get("authorization");
  return authz ? { Authorization: authz } : {};
}
