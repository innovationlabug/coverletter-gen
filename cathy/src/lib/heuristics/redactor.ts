import { findMoneyMentions } from "./money";
import { foldPreservingLength } from "./fold";

/**
 * Redactor determinista. Corre en el navegador (antes de armar el payload para Gemini) y
 * OTRA VEZ en el servidor (defensa en profundidad).
 *
 * Por qué no necesita modelo: correos, teléfonos de 8 dígitos, DPI de 13 dígitos, NIT y
 * montos tienen formatos cerrados. El nombre del empleador actual lo conocemos (la persona
 * lo escribió en el formulario), así que basta buscarlo sin importar mayúsculas ni tildes.
 * Un modelo no agregaría precisión y sí agregaría la posibilidad de "decidir" no redactar.
 */

export type SensitiveKind = "email" | "dpi" | "nit" | "phone" | "money" | "employer" | "currency_word";

export interface Finding {
  kind: SensitiveKind;
  start: number;
  end: number;
  match: string;
}

export interface RedactionContext {
  /** Nombre del empleador actual (solo lo conoce el navegador). */
  employer?: string;
  /** Montos conocidos (salario actual/deseado): se redactan aunque parezcan un año o un número suelto. */
  knownAmounts?: number[];
}

export const PLACEHOLDER: Record<SensitiveKind, string> = {
  email: "[CORREO]",
  dpi: "[DPI]",
  nit: "[NIT]",
  phone: "[TELÉFONO]",
  money: "[MONTO]",
  employer: "[EMPLEADOR_ACTUAL]",
  currency_word: "[MONEDA]",
};

const EMAIL_RE = /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu;
// DPI: 13 dígitos, con o sin separadores 4-5-4.
const DPI_RE = /(?<!\d)\d{4}[ \-]?\d{5}[ \-]?\d{4}(?!\d)/g;
// NIT: con etiqueta "NIT" o con el formato típico número-dígito verificador (1234567-8 / 123456-K).
const NIT_RE = /\bNIT\b\s*[:#.]?\s*[\dkK][\d\-]{3,}[\dkK]?|(?<![\d\-])\d{5,8}-[\dkK](?![\p{L}\d])/giu;
// Teléfonos GT: 8 dígitos que empiezan en 2–7, opcional +502, con espacio o guion al medio.
const PHONE_RE = /(?<![\d+])(?:\+?\(?502\)?[ \-]?)?[2-7]\d{3}[ \-]?\d{4}(?!\d)/g;
// Palabras de moneda sueltas (residuo típico de "gano quince mil quetzales" mal escrito).
const CURRENCY_WORD_RE = /(?<![\p{L}])(?:quetzales|quetzal|d[oó]lares)(?![\p{L}])/giu;

const LEGAL_SUFFIX_RE = /[,\s]*(?:s\.?\s?a\.?|ltda\.?|inc\.?|corp\.?|s\.?\s?de\s?r\.?\s?l\.?|llc)\s*$/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Palabras genéricas de razones sociales. Un token del nombre del empleador que NO esté aquí
 * y tenga ≥ 4 letras se considera "distintivo" y se redacta por sí solo: "Grupo Pantaleon"
 * también protege "trabajé en Pantaleon"; "Tigo Guatemala" protege "la app de Tigo".
 */
export const GENERIC_EMPLOYER_WORDS = new Set([
  "grupo", "banco", "corporacion", "compania", "empresa", "empresas", "colegio", "hospital", "constructora",
  "distribuidora", "farmacias", "farmacia", "almacenes", "bufete", "guatemala", "guatemalteca", "centroamerica",
  "centroamericana", "industrial", "nacional", "internacional", "sociedad", "anonima", "servicios", "soluciones",
  "tecnologia", "comercial", "americano", "americana", "general", "global", "consultores", "consultoria",
  "asociados", "universidad", "instituto", "ministerio", "municipalidad", "fundacion", "clinica", "tienda",
  "tiendas", "cooperativa", "latam", "group", "bank", "company", "solutions", "services", "the", "and",
]);

function cleanEmployer(employer: string): string {
  return foldPreservingLength(employer.trim()).replace(LEGAL_SUFFIX_RE, "").trim();
}

export function employerPattern(employer: string): RegExp | null {
  const cleaned = cleanEmployer(employer);
  if (cleaned.length < 3) return null;
  const tokens = cleaned.split(/\s+/).map(escapeRegExp);
  return new RegExp(String.raw`(?<![\p{L}\d])${tokens.join(String.raw`[\s\-]+`)}(?![\p{L}\d])`, "gu");
}

export function distinctiveEmployerTokens(employer: string): string[] {
  return cleanEmployer(employer)
    .split(/[\s,.\-]+/)
    .filter((t) => t.length >= 4 && !GENERIC_EMPLOYER_WORDS.has(t));
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.001);
}

/**
 * Encuentra datos sensibles. Cada detector corre sobre una copia donde lo ya encontrado se
 * enmascara con caracteres neutros de la misma longitud (así un DPI no se cuenta también
 * como teléfono + monto, y las posiciones siguen siendo válidas en el texto original).
 */
export function findSensitive(
  text: string,
  ctx: RedactionContext = {},
  opts: { currencyWords?: boolean } = {},
): Finding[] {
  const findings: Finding[] = [];
  let work = text;
  const mask = (start: number, end: number) => {
    work = work.slice(0, start) + "░".repeat(end - start) + work.slice(end);
  };
  const run = (kind: SensitiveKind, re: RegExp, folded = false) => {
    const hay = folded ? foldPreservingLength(work) : work;
    const found: Finding[] = [];
    for (const m of hay.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      found.push({ kind, start, end, match: text.slice(start, end) });
    }
    findings.push(...found);
    for (const f of found) mask(f.start, f.end);
  };

  run("email", EMAIL_RE);
  run("dpi", DPI_RE);
  run("nit", NIT_RE);
  run("phone", PHONE_RE);

  const known = ctx.knownAmounts?.filter((n) => Number.isFinite(n) && n > 0) ?? [];
  for (const m of findMoneyMentions(work)) {
    if (work.slice(m.start, m.end).includes("░")) continue;
    const isKnown = known.some((k) => approxEqual(m.value, k));
    if (m.isMoney || isKnown) {
      findings.push({ kind: "money", start: m.start, end: m.end, match: text.slice(m.start, m.end) });
    }
  }
  for (const f of findings.filter((f) => f.kind === "money")) mask(f.start, f.end);

  if (ctx.employer) {
    const re = employerPattern(ctx.employer);
    if (re) run("employer", re, true);
    for (const token of distinctiveEmployerTokens(ctx.employer)) {
      run("employer", new RegExp(String.raw`(?<![\p{L}\d])${escapeRegExp(token)}(?![\p{L}\d])`, "gu"), true);
    }
  }

  if (opts.currencyWords) {
    for (const m of work.matchAll(CURRENCY_WORD_RE)) {
      findings.push({ kind: "currency_word", start: m.index!, end: m.index! + m[0].length, match: m[0] });
    }
  }

  return findings.sort((a, b) => a.start - b.start);
}

export interface RedactionResult {
  text: string;
  findings: Finding[];
}

export function redact(text: string, ctx: RedactionContext = {}, opts: { currencyWords?: boolean } = {}): RedactionResult {
  const findings = findSensitive(text, ctx, opts);
  let out = text;
  for (const f of [...findings].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, f.start) + PLACEHOLDER[f.kind] + out.slice(f.end);
  }
  return { text: out, findings };
}

/**
 * Chequeo de residuo (servidor): después de redactar, ¿queda algo que huela a dato sensible?
 * Incluye palabras de moneda sueltas, que el redactor no reemplaza pero delatan una cifra
 * escrita de forma rara ("gano quince mil quetzales" → "gano [MONTO]" sí; "gano muchos
 * quetzales" → residuo, se bloquea).
 */
export function findResidual(text: string): Finding[] {
  return findSensitive(text, {}, { currencyWords: true });
}

/** Reemplaza marcadores por frases neutras, para textos que verá un reclutador. */
export function humanizePlaceholders(text: string, lang: "es" | "en" = "es"): string {
  const es: Record<string, string> = {
    "[MONTO]": "un monto significativo",
    "[EMPLEADOR_ACTUAL]": "mi empleador actual",
    "[CORREO]": "",
    "[TELÉFONO]": "",
    "[DPI]": "",
    "[NIT]": "",
    "[MONEDA]": "",
  };
  const en: Record<string, string> = {
    "[MONTO]": "a significant amount",
    "[EMPLEADOR_ACTUAL]": "my current employer",
    "[CORREO]": "",
    "[TELÉFONO]": "",
    "[DPI]": "",
    "[NIT]": "",
    "[MONEDA]": "",
  };
  const map = lang === "en" ? en : es;
  let out = text;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out.replace(/[ \t]{2,}/g, " ");
}
