/**
 * Deterministic redactor + validator. Pure TypeScript, runs in the browser
 * (and in the route handlers as a second line of defense).
 *
 * - `findSensitive(text, ctx)`   → list of findings (never logs the raw value)
 * - `redactText(text, ctx)`      → text with findings replaced by neutral tags
 * - `assertPayloadClean(obj, ctx)` → throws `SensitiveDataError` if any string
 *                                    inside the payload still has a finding
 * - `dropSensitiveSentences(text, ctx)` → removes whole sentences with findings
 *                                    (used by the local template letter)
 *
 * No model is involved: every rule is a regex or an exact comparison, so the
 * behaviour is reproducible and covered by unit tests.
 */

export type FindingKind =
  | "email"
  | "dpi"
  | "nit"
  | "phone"
  | "employer"
  | "name"
  | "salary"
  | "money";

export interface Finding {
  kind: FindingKind;
  start: number;
  end: number;
  /** Masked preview, safe to render in the UI (never the full value). */
  preview: string;
}

export interface SensitiveContext {
  /** Current employer — matched case- and accent-insensitively. */
  currentEmployer?: string;
  /** Amounts that must never leave (current salary, desired salary…). */
  salaries?: number[];
  /** Full names to hide (the user's own name). */
  names?: string[];
}

export class SensitiveDataError extends Error {
  readonly findings: Finding[];
  readonly field?: string;
  constructor(findings: Finding[], field?: string) {
    const kinds = [...new Set(findings.map((f) => f.kind))].join(", ");
    super(
      `Envío bloqueado: el payload contiene datos sensibles (${kinds})${
        field ? ` en «${field}»` : ""
      }.`,
    );
    this.name = "SensitiveDataError";
    this.findings = findings;
    this.field = field;
  }
}

export const REDACTION_TAGS: Record<FindingKind, string> = {
  email: "[correo]",
  dpi: "[DPI]",
  nit: "[NIT]",
  phone: "[teléfono]",
  employer: "[empleador actual]",
  name: "[nombre]",
  salary: "[monto]",
  money: "[monto]",
};

/** Lower priority number wins when two findings have the same span. */
const PRIORITY: Record<FindingKind, number> = {
  email: 0,
  dpi: 1,
  nit: 2,
  phone: 3,
  employer: 4,
  name: 5,
  salary: 6,
  money: 7,
};

// ---------------------------------------------------------------------------
// Regex building blocks
// ---------------------------------------------------------------------------

/** A number: grouped (15,000 / 15.000 / 15 000 / 15,000.00) or plain (15000 / 15000.5). */
const NUM = String.raw`(?:\d{1,3}(?:[.,   ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const SCALE = String.raw`(?:\s?(?:k|mil|millones|millón|millon)(?![\p{L}\p{N}]))`;
const CURRENCY_PREFIX = String.raw`(?:US\s?\$|USD|GTQ|Q\.?|\$)`;
const CURRENCY_SUFFIX = String.raw`(?:quetzales|quetzal|dólares|dolares|USD|GTQ)`;

const NUMBER_WORDS = [
  "un",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veinti[\\p{L}]+",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
  "cien",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
].join("|");

const RE = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // DPI: 13 digits, usually 4-5-4 with spaces or dashes.
  dpi: /(?<!\d)\d{4}[\s-]?\d{5}[\s-]?\d{4}(?!\d)/g,
  // NIT: "NIT 1234567-8", "NIT: 123456K" or bare "1234567-8" / "123456-K".
  nitLabeled: /\bNIT\b\s*[:#.]?\s*\d[\d-]{3,}[\dkK]?(?![\dkK])/gi,
  nitBare: /(?<![\d-])\d{5,9}-[\dkK](?![\dA-Za-z-])/g,
  // Guatemalan phones: 8 digits starting 2–7, optional +502 / 502 / 00502.
  phone:
    /(?:(?:\+|00)?\(?502\)?[\s-]?[2-7]\d{3}[\s-]?\d{4}|(?<!\d)[2-7]\d{3}[\s-]?\d{4})(?!\d)/g,
  moneyPrefix: new RegExp(
    String.raw`(?<![\p{L}\p{N}])${CURRENCY_PREFIX}\s?${NUM}${SCALE}?`,
    "giu",
  ),
  moneySuffix: new RegExp(
    String.raw`(?<![\p{N}.,])${NUM}${SCALE}?\s?${CURRENCY_SUFFIX}(?![\p{L}])`,
    "giu",
  ),
  moneyScale: new RegExp(String.raw`(?<![\p{N}.,])${NUM}${SCALE}`, "giu"),
  moneyWords: new RegExp(
    String.raw`(?<![\p{L}])(?:${NUMBER_WORDS})(?:\s+y\s+(?:${NUMBER_WORDS}))?\s+mil(?![\p{L}])`,
    "giu",
  ),
  // 1,500 / 15.000 / 15 000 / 15,000.00 without currency.
  groupedNumber:
    /(?<![\d.,])\d{1,3}(?:[.,   ]\d{3})+(?:[.,]\d{1,2})?(?![\d])/g,
  // 4+ digit integers without currency (years 1900–2099 are excluded later).
  bareNumber: /(?<![\d.,])\d{4,}(?:[.,]\d{1,2})?(?![\d])/g,
  // Any number token, used to compare against the exact salary values.
  anyNumber: new RegExp(String.raw`(?<![\p{N}.,])${NUM}${SCALE}?`, "giu"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function preview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 2) return "••";
  return `${trimmed[0]}${"•".repeat(Math.min(6, trimmed.length - 1))}`;
}

function* matchAll(re: RegExp, text: string): Generator<RegExpExecArray> {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    if (m[0].length === 0) {
      r.lastIndex++;
      continue;
    }
    yield m;
  }
}

/** Strip accents + lowercase, one output char per input char (keeps indexes aligned). */
export function foldChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    // Keep a 1:1 mapping of UTF-16 code units so indexes stay aligned.
    const unit = base.length === ch.length ? base : ch.toLowerCase().slice(0, ch.length).padEnd(ch.length, " ");
    out += unit;
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LEGAL_SUFFIXES = /\b(s\.?\s?a\.?(\s?de\s?c\.?\s?v\.?)?|s\.?\s?r\.?\s?l\.?|ltda\.?|inc\.?|llc|corp\.?|cia\.?|compania|limitada)\s*$/i;

/** Tokens used to match a proper name / employer flexibly. */
function phraseTokens(phrase: string): string[] {
  let p = foldChars(phrase).trim();
  // Remove trailing legal suffixes ("Banco Industrial, S.A." → "banco industrial").
  for (let i = 0; i < 3; i++) p = p.replace(/[,\s]+$/, "").replace(LEGAL_SUFFIXES, "");
  return p.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function phraseRegex(phrase: string): RegExp | null {
  const tokens = phraseTokens(phrase);
  if (tokens.length === 0) return null;
  const body = tokens.map(escapeRegex).join(String.raw`[^\p{L}\p{N}]{0,3}`);
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${body}(?![\p{L}\p{N}])`, "gu");
}

/**
 * Parse a written amount ("Q15,000.00", "15 000", "15k", "15 mil", "1.5 millones")
 * into a number. Returns NaN if it cannot.
 */
export function parseAmount(raw: string): number {
  let s = raw
    .toLowerCase()
    .replace(/us\s?\$|usd|gtq|quetzales|quetzal|dólares|dolares|\$/g, "")
    .replace(/^\s*q\.?/, "")
    .trim();
  let scale = 1;
  const scaleMatch = s.match(/\s?(k|mil|millones|millón|millon)$/);
  if (scaleMatch) {
    scale = scaleMatch[1] === "k" || scaleMatch[1] === "mil" ? 1_000 : 1_000_000;
    s = s.slice(0, s.length - scaleMatch[0].length).trim();
  }
  s = s.replace(/[  ]/g, " ");
  if (/^\d{1,3}(?:[., ]\d{3})+(?:[.,]\d{1,2})?$/.test(s)) {
    // Grouped: last separator followed by 1–2 digits is the decimal mark.
    const dec = s.match(/[.,](\d{1,2})$/);
    let intPart = s;
    let decPart = "";
    if (dec) {
      intPart = s.slice(0, s.length - dec[0].length);
      decPart = dec[1];
    }
    const n = Number(intPart.replace(/[., ]/g, "") + (decPart ? `.${decPart}` : ""));
    return n * scale;
  }
  if (/^\d+(?:[.,]\d{1,2})?$/.test(s)) {
    return Number(s.replace(",", ".")) * scale;
  }
  return Number.NaN;
}

/** All the ways a Guatemalan user may write an amount (used by tests). */
export function salaryWrittenForms(amount: number): string[] {
  const n = Math.round(amount);
  const plain = String(n);
  const comma = n.toLocaleString("en-US");
  const dot = comma.replace(/,/g, ".");
  const space = comma.replace(/,/g, " ");
  const forms = new Set<string>([
    plain,
    comma,
    dot,
    space,
    `${comma}.00`,
    `Q${comma}`,
    `Q ${comma}`,
    `Q${plain}`,
    `Q ${space}`,
    `Q.${comma}`,
    `$${comma}`,
    `USD ${plain}`,
    `${plain} quetzales`,
  ]);
  if (n % 1000 === 0) {
    forms.add(`${n / 1000}k`);
    forms.add(`${n / 1000}K`);
    forms.add(`${n / 1000} mil`);
  }
  return [...forms];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function findSensitive(text: string, ctx: SensitiveContext = {}): Finding[] {
  if (!text) return [];
  const candidates: Finding[] = [];
  const push = (kind: FindingKind, start: number, end: number) => {
    candidates.push({ kind, start, end, preview: preview(text.slice(start, end)) });
  };

  for (const m of matchAll(RE.email, text)) push("email", m.index, m.index + m[0].length);
  for (const m of matchAll(RE.dpi, text)) push("dpi", m.index, m.index + m[0].length);
  for (const m of matchAll(RE.nitLabeled, text)) push("nit", m.index, m.index + m[0].length);
  for (const m of matchAll(RE.nitBare, text)) push("nit", m.index, m.index + m[0].length);
  for (const m of matchAll(RE.phone, text)) push("phone", m.index, m.index + m[0].length);

  // Employer and names: match on the accent-folded text (same indexes).
  const folded = foldChars(text);
  if (ctx.currentEmployer && ctx.currentEmployer.trim()) {
    const re = phraseRegex(ctx.currentEmployer);
    if (re) for (const m of matchAll(re, folded)) push("employer", m.index, m.index + m[0].length);
  }
  for (const name of ctx.names ?? []) {
    if (!name || name.trim().length < 3) continue;
    const re = phraseRegex(name);
    if (re) for (const m of matchAll(re, folded)) push("name", m.index, m.index + m[0].length);
  }

  const salaries = (ctx.salaries ?? []).filter((n) => Number.isFinite(n) && n > 0);
  const isSalary = (raw: string) => {
    const v = parseAmount(raw);
    return Number.isFinite(v) && salaries.some((s) => Math.abs(s - v) < 0.5);
  };
  const moneyKind = (raw: string): FindingKind => (isSalary(raw) ? "salary" : "money");

  for (const re of [RE.moneyPrefix, RE.moneySuffix, RE.moneyScale]) {
    for (const m of matchAll(re, text)) {
      const raw = m[0].replace(/\s+$/, "");
      push(moneyKind(raw), m.index, m.index + raw.length);
    }
  }
  for (const m of matchAll(RE.moneyWords, text)) push("money", m.index, m.index + m[0].length);
  for (const m of matchAll(RE.groupedNumber, text)) {
    push(moneyKind(m[0]), m.index, m.index + m[0].length);
  }
  for (const m of matchAll(RE.bareNumber, text)) {
    const v = Number(m[0].replace(",", "."));
    const isYear = /^\d{4}$/.test(m[0]) && v >= 1900 && v <= 2099;
    if (isYear && !isSalary(m[0])) continue;
    push(moneyKind(m[0]), m.index, m.index + m[0].length);
  }
  // Exact salary values in any other shape (e.g. a 3-digit salary "800").
  if (salaries.length) {
    for (const m of matchAll(RE.anyNumber, text)) {
      if (isSalary(m[0])) push("salary", m.index, m.index + m[0].length);
    }
    // Literal digits glued to other characters ("ref15000x").
    for (const s of salaries) {
      const digits = String(Math.round(s));
      for (const m of matchAll(new RegExp(`(?<!\\d)${digits}(?!\\d)`, "g"), text)) {
        push("salary", m.index, m.index + m[0].length);
      }
    }
  }

  // Resolve overlaps: earliest start, then longest, then priority.
  candidates.sort(
    (a, b) =>
      a.start - b.start || b.end - b.start - (a.end - a.start) || PRIORITY[a.kind] - PRIORITY[b.kind],
  );
  const accepted: Finding[] = [];
  for (const c of candidates) {
    const overlaps = accepted.some((a) => c.start < a.end && a.start < c.end);
    if (!overlaps) accepted.push(c);
    else {
      // Same span but higher-priority kind → replace (e.g. money → salary).
      const same = accepted.findIndex((a) => a.start === c.start && a.end === c.end);
      if (same >= 0 && PRIORITY[c.kind] < PRIORITY[accepted[same].kind]) accepted[same] = c;
    }
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export interface RedactionResult {
  text: string;
  findings: Finding[];
}

export function redactText(text: string, ctx: SensitiveContext = {}): RedactionResult {
  const findings = findSensitive(text, ctx);
  let out = "";
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.start) + REDACTION_TAGS[f.kind];
    cursor = f.end;
  }
  out += text.slice(cursor);
  return { text: out, findings };
}

/** Walk any JSON-like value and yield [path, string] for every string/number/key. */
export function* walkStrings(value: unknown, path = "$"): Generator<[string, string]> {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    yield [path, value];
  } else if (typeof value === "number" || typeof value === "boolean") {
    yield [path, String(value)];
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* walkStrings(value[i], `${path}[${i}]`);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      yield [`${path}.<key>`, k];
      yield* walkStrings(v, `${path}.${k}`);
    }
  }
}

/** Throws `SensitiveDataError` if any string inside `payload` has a finding. */
export function assertPayloadClean(payload: unknown, ctx: SensitiveContext = {}): void {
  for (const [path, s] of walkStrings(payload)) {
    // Numbers stored as numbers (e.g. yearsExperience) are not money.
    const findings = findSensitive(s, ctx).filter(
      (f) => !(f.kind === "money" && /^\d{1,2}$/.test(s)),
    );
    if (findings.length) throw new SensitiveDataError(findings, path);
  }
}

/**
 * Remove every sentence/line that contains a finding. Used by the local
 * template letter: better to drop a sentence than to print "[monto]" in a
 * letter the user will send to a recruiter.
 */
export function dropSensitiveSentences(text: string, ctx: SensitiveContext = {}): string {
  const pieces = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return pieces.filter((p) => findSensitive(p, ctx).length === 0).join(" ");
}

/** Build the sensitive context from a profile (kept here so every caller agrees). */
export function contextFromProfile(p: {
  currentEmployer?: string;
  currentSalary?: number;
  desiredSalary?: number;
  name?: string;
}): SensitiveContext {
  return {
    currentEmployer: p.currentEmployer,
    salaries: [p.currentSalary, p.desiredSalary].filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
    ),
    names: p.name ? [p.name] : [],
  };
}
