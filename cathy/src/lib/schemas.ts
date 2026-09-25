import { z } from "zod";

export const MODELS = ["gemma4:e2b-it-qat", "qwen3.5:2b"] as const;
export type ModelId = (typeof MODELS)[number];
export const DEFAULT_MODEL: ModelId = "gemma4:e2b-it-qat";

export function isModelId(m: unknown): m is ModelId {
  return typeof m === "string" && (MODELS as readonly string[]).includes(m);
}

export const MoneySchema = z
  .object({ amount: z.number().positive().max(10_000_000), currency: z.enum(["GTQ", "USD"]) })
  .strict();

/** Perfil completo: solo lo aceptan el navegador (tier 0) y el proxy de Ollama (tier 1). */
export const ProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(80),
    email: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    currentRole: z.string().trim().min(1).max(120),
    currentEmployer: z.string().trim().min(1).max(120),
    currentSalary: MoneySchema,
    desiredRole: z.string().trim().min(1).max(120),
    desiredSalary: MoneySchema,
    targetCompany: z.string().trim().min(1).max(120),
    yearsExperience: z.number().int().min(0).max(60),
    achievements: z.string().max(3000),
    jobOffer: z.string().max(12000).optional(),
  })
  .strict();

export const SENIORITIES = ["junior", "semi-senior", "senior", "lead"] as const;

/**
 * Lo ÚNICO que puede llegar a Gemini (tier 2). `.strict()` rechaza cualquier campo extra:
 * si alguien agrega `currentSalary` al body, el servidor responde 400.
 */
export const LetterPayloadSchema = z
  .object({
    fullName: z.string().trim().min(1).max(80),
    desiredRole: z.string().trim().min(1).max(120),
    targetCompany: z.string().trim().min(1).max(120),
    yearsExperience: z.number().int().min(0).max(60),
    achievements: z.string().max(3000),
    requirements: z.array(z.string().max(240)).max(15),
    language: z.enum(["es", "en"]),
    seniority: z.enum(SENIORITIES),
  })
  .strict();
export type LetterPayload = z.infer<typeof LetterPayloadSchema>;

/** Salida estructurada que le pedimos al modelo local para la oferta. */
export const RequirementsSchema = z.object({
  must: z.array(z.string().min(1).max(200)).max(12),
  nice: z.array(z.string().min(1).max(200)).max(12),
  keywords: z.array(z.string().min(1).max(60)).max(15),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

/** JSON Schema para el parámetro `format` de Ollama (salida estructurada). */
export const REQUIREMENTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    must: { type: "array", items: { type: "string" } },
    nice: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["must", "nice", "keywords"],
} as const;

export const OllamaNegotiationBody = z.object({ model: z.enum(MODELS), profile: ProfileSchema }).strict();
export const OllamaRequirementsBody = z.object({ model: z.enum(MODELS), offer: z.string().min(20).max(12000) }).strict();
