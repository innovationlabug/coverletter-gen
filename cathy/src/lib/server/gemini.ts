import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { LetterPayload } from "../schemas";
import { letterPrompt } from "../prompts";

/**
 * Gemini vía Vertex AI. Sin API key: en Cloud Run autentica la cuenta de servicio
 * coverletter-cathy-app (roles/aiplatform.user); en local, ADC (`gcloud auth application-default login`).
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  client ??= new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || "ai-experiments-487722",
    location: process.env.GOOGLE_CLOUD_LOCATION || "global",
  });
  return client;
}

const RETRYABLE = /\b(429|500|503)\b|RESOURCE_EXHAUSTED|INTERNAL|UNAVAILABLE/;

/**
 * Un reintento ante errores transitorios de Vertex. En la primera prueba real con la app
 * completa, Vertex respondió 500 INTERNAL y la carta cayó a la plantilla (el fallback
 * funcionó, pero un reintento de 1.5 s lo habría evitado).
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 1, waitMs = 1500): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0 || !RETRYABLE.test(e instanceof Error ? e.message : String(e))) throw e;
    await new Promise((r) => setTimeout(r, waitMs));
    return withRetry(fn, retries - 1, waitMs * 2);
  }
}

export async function generateLetter(payload: LetterPayload): Promise<{ text: string; model: string }> {
  const { system, user } = letterPrompt(payload);
  const res = await withRetry(() => getGenAI().models.generateContent({
    model: GEMINI_MODEL,
    contents: user,
    config: {
      systemInstruction: system,
      temperature: 0.7,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  }));
  const text = res.text?.trim();
  if (!text) throw new Error("Gemini devolvió una respuesta vacía");
  return { text, model: GEMINI_MODEL };
}
