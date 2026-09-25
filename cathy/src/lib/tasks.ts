import type { Profile } from "./types";
import type { OllamaChatRequest } from "./ollama-client";
import { computeFacts } from "./facts";
import { negotiationMessages, requirementsMessages } from "./prompts";
import { REQUIREMENTS_JSON_SCHEMA, RequirementsSchema, type Requirements } from "./schemas";

export type OllamaTask = "negotiation" | "requirements";
export const OLLAMA_TASKS: OllamaTask[] = ["negotiation", "requirements"];

/**
 * Opciones por tarea. requirements: temperatura 0 + JSON Schema (extracción = determinista).
 * negotiation: temperatura baja (0.3) para que la prosa no suene robótica sin inventar.
 * El benchmark usa temperatura 0 en ambas para que las 3 corridas sean comparables.
 */
export const TASK_SETTINGS: Record<OllamaTask, Pick<OllamaChatRequest, "options" | "format" | "think">> = {
  negotiation: { think: false, options: { temperature: 0.3, num_predict: 450 } },
  requirements: { think: false, format: REQUIREMENTS_JSON_SCHEMA as unknown as Record<string, unknown>, options: { temperature: 0, num_predict: 600 } },
};

export function buildNegotiationRequest(model: string, profile: Profile): OllamaChatRequest {
  return { model, messages: negotiationMessages(profile, computeFacts(profile)), ...TASK_SETTINGS.negotiation };
}

export function buildRequirementsRequest(model: string, offer: string): OllamaChatRequest {
  return { model, messages: requirementsMessages(offer), ...TASK_SETTINGS.requirements };
}

/** Parsea la salida del modelo; tolera ```json fences. null si no cumple el esquema. */
export function parseRequirements(content: string): { value: Requirements | null; jsonValid: boolean; schemaValid: boolean } {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { value: null, jsonValid: false, schemaValid: false };
  }
  const parsed = RequirementsSchema.safeParse(json);
  return parsed.success ? { value: parsed.data, jsonValid: true, schemaValid: true } : { value: null, jsonValid: true, schemaValid: false };
}
