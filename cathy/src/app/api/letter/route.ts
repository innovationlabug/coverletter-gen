import { LetterPayloadSchema, type LetterPayload } from "@/lib/schemas";
import { redact, findResidual, humanizePlaceholders } from "@/lib/heuristics/redactor";
import { generateLetter } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tier 2 (tercero): Gemini vía Vertex AI.
 * Defensa en profundidad — el cliente ya redactó, pero aquí:
 *  1. zod .strict(): cualquier campo que no esté en la allowlist → 400.
 *  2. Se vuelve a correr el redactor en cada texto libre (montos, correos, teléfonos, DPI, NIT).
 *  3. Si después de redactar queda residuo (p. ej. "quetzales" suelto) → 422, no se llama a Gemini.
 */
const FREE_TEXT: Array<"fullName" | "desiredRole" | "targetCompany" | "achievements"> = [
  "fullName",
  "desiredRole",
  "targetCompany",
  "achievements",
];

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = LetterPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const unknownKeys = parsed.error.issues.flatMap((i) => (i.code === "unrecognized_keys" ? i.keys : []));
    return Response.json({ error: "invalid_body", unknownKeys }, { status: 400 });
  }

  let redactions = 0;
  const payload: LetterPayload = { ...parsed.data };
  for (const k of FREE_TEXT) {
    const r = redact(payload[k]);
    redactions += r.findings.length;
    payload[k] = r.text;
  }
  payload.requirements = payload.requirements.map((t) => {
    const r = redact(t);
    redactions += r.findings.length;
    return r.text;
  });

  const residual = [...FREE_TEXT.map((k) => payload[k]), ...payload.requirements].flatMap((t) => findResidual(t));
  if (residual.length > 0) {
    return Response.json(
      { error: "residual_sensitive", kinds: [...new Set(residual.map((f) => f.kind))] },
      { status: 422 },
    );
  }

  const t0 = performance.now();
  try {
    const { text, model } = await generateLetter(payload);
    return Response.json({
      letter: humanizePlaceholders(text, payload.language),
      model,
      latencyMs: Math.round(performance.now() - t0),
      serverRedactions: redactions,
    });
  } catch (err) {
    console.error("[letter]", err instanceof Error ? err.message : err);
    return Response.json({ error: "gemini_failed" }, { status: 502 });
  }
}
