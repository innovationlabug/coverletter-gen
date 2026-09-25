import { execFileSync } from "node:child_process";

/**
 * Auth del benchmark hacia el Ollama privado.
 * Con credenciales de USUARIO, google-auth-library no puede emitir ID tokens (eso solo lo
 * hacen cuentas de servicio / metadata server), así que usamos `gcloud auth
 * print-identity-token`. OLLAMA_TOKEN lo sobreescribe. http:// (local o mock) → sin auth.
 */
let cached: { token: string; at: number } | null = null;
const TTL_MS = 45 * 60 * 1000; // los ID tokens duran 1 h

export function benchAuthHeaders(ollamaUrl: string): Record<string, string> {
  if (process.env.OLLAMA_TOKEN) return { Authorization: `Bearer ${process.env.OLLAMA_TOKEN}` };
  if (!ollamaUrl.startsWith("https://")) return {};
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const token = execFileSync("gcloud", ["auth", "print-identity-token"], { encoding: "utf8" }).trim();
    cached = { token, at: Date.now() };
  }
  return { Authorization: `Bearer ${cached.token}` };
}
