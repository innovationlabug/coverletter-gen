/**
 * Deterministic redactor. No model involved: every rule is a regular expression or a
 * string comparison, so the behaviour is reproducible and testable (tests/unit/redact.test.ts
 * and the 18-case evaluation in eval/).
 *
 * Detected types: salary (money in any form), employer (the declared current employer),
 * person_name (people introduced by role/title, plus the user's own name), phone (GT),
 * email, dpi, address (GT heuristics), nit.
 */
import { collapseDigitSeparators, normalize } from './money';
import type { Currency, Finding, SensitiveType } from './types';

export interface RedactContext {
  /** Declared current employer (matched case/accent-insensitive, acronym, typos). */
  employer?: string;
  /** Declared names of the user; replaced by NAME_PLACEHOLDER instead of a tag. */
  ownNames?: string[];
  /**
   * Declared PUBLIC strings (target company, desired role). Findings that fall entirely inside
   * one of their occurrences are dropped: "Café Calle Real" is a company, not an address.
   */
  keep?: string[];
}

export const TAGS: Record<SensitiveType, string> = {
  salary: '[SALARIO]',
  employer: '[EMPLEADOR_ACTUAL]',
  person_name: '[PERSONA]',
  phone: '[TELÉFONO]',
  email: '[CORREO]',
  dpi: '[DPI]',
  address: '[DIRECCIÓN]',
  nit: '[NIT]',
};

export const NAME_PLACEHOLDER = '{{NOMBRE}}';

/** Lower number = wins when two findings overlap with the same start. */
const PRIORITY: Record<SensitiveType, number> = {
  email: 0,
  dpi: 1,
  nit: 2,
  phone: 3,
  salary: 4,
  address: 5,
  employer: 6,
  person_name: 7,
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const NUM = String.raw`\d{1,3}(?:[.,\s']\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d+)?(?!\d)`;
const PREFIX = String.raw`(?:GTQ|US\$|USD|U\$S|\$|Q\.?|quetzales)`;
const MULT = String.raw`(?:k|K|mil)(?![a-záéíóúñ])`;
const CUR_SUFFIX = String.raw`(?:quetzales|quetzal|d[óo]lares|d[óo]lar|USD|GTQ|dls\.?)(?![a-záéíóúñ])`;

const NUMBER_WORD = [
  'un', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'diecis[eé]is', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veinti[uú]n', 'veintid[oó]s', 'veintitr[eé]s', 'veinticuatro', 'veinticinco', 'veintis[eé]is',
  'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta',
  'ochenta', 'noventa', 'cien', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
].join('|');
const WORDS_AMOUNT = String.raw`\b(?:(?:${NUMBER_WORD})(?:\s+y\s+(?:${NUMBER_WORD}))?\s+)?mil(?![a-záéíóúñ])(?:\s+(?:${NUMBER_WORD})(?![a-záéíóúñ]))*(?:\s+${CUR_SUFFIX})?`;

/** Nouns that indicate a count of things, not money: "10,000 usuarios". */
const COUNT_NOUNS =
  /^\s*(?:\+?\s*)?(?:usuari[oa]s?|clientes?|personas?|transacciones|descargas|registros|horas|visitas|empleados|colaboradores|estudiantes|alumnos|productos|pedidos|tickets|solicitudes|l[ií]neas|km|metros|m2|unidades|seguidores|suscriptores|users|customers|downloads|requests|records|hours|downloads|piezas|casos|expedientes|facturas|p[aá]ginas|beneficiarios|pacientes|socios|tiendas|agencias|sucursales|puntos)/i;

export interface MoneyMention {
  raw: string;
  index: number;
  value: number;
  currency: Currency | null;
}

function parseNumber(raw: string): number {
  // "15,000.50" / "15.000,50" / "15 000" / "12,5"
  let s = raw.replace(/[\s']/g, '');
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (lastSep >= 0) {
    const decimals = s.length - lastSep - 1;
    if (decimals === 3) s = s.replace(/[.,]/g, '');
    else s = s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1);
  }
  return Number(s);
}

function currencyOf(raw: string): Currency | null {
  const n = normalize(raw);
  if (/(usd|us\$|u\$s|\$|dolar|dls)/.test(n)) return 'USD';
  if (/(gtq|quetzal|\bq\.?\s*\d|^q)/.test(n)) return 'GTQ';
  return null;
}

const SPANISH_NUMBER_VALUES: Record<string, number> = {
  un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200,
  trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
  novecientos: 900,
};

function wordsValue(raw: string): number {
  const n = normalize(raw);
  const [before, after = ''] = n.split(/\bmil\b/);
  const sum = (s: string) =>
    s
      .split(/\s+|\by\b/)
      .map((w) => SPANISH_NUMBER_VALUES[w] ?? 0)
      .reduce((a, b) => a + b, 0);
  const thousands = sum(before) || 1;
  return thousands * 1000 + sum(after);
}

function isYearLike(raw: string, value: number): boolean {
  return /^\d{4}$/.test(raw.trim()) && value >= 1950 && value <= 2039;
}

/** All money mentions in a text, with parsed value and currency when recognisable. */
export function findMoney(text: string): MoneyMention[] {
  const out: MoneyMention[] = [];
  const push = (raw: string, index: number, value: number, currency: Currency | null) => {
    if (!Number.isFinite(value)) return;
    out.push({ raw, index, value, currency });
  };

  // A) prefix + number [+ multiplier] [+ currency suffix]: Q15,000 · Q 15 000 · $2,000 · USD 2000 · Q15K
  const reA = new RegExp(String.raw`${PREFIX}\s?(${NUM})(\s?${MULT})?(\s?${CUR_SUFFIX})?`, 'gi');
  for (const m of text.matchAll(reA)) {
    let value = parseNumber(m[1]);
    if (m[2]) value *= 1000;
    // "Q3 2024" (a quarter) or "$5": too small to be a salary unless a multiplier was written.
    if (!m[2] && value < 100) continue;
    // "Q" must not be the end of a word ("IQ 2000").
    if (m.index! > 0 && /[A-Za-z]/.test(text[m.index! - 1]) && /^q/i.test(m[0])) continue;
    push(m[0], m.index!, value, currencyOf(m[0]));
  }

  // B) number + multiplier [+ currency]: 15 mil · 15k · 15mil quetzales · 12,5 mil
  const reB = new RegExp(String.raw`(?<![\w$])(${NUM})\s?${MULT}(\s?${CUR_SUFFIX})?`, 'gi');
  for (const m of text.matchAll(reB)) {
    push(m[0], m.index!, parseNumber(m[1]) * 1000, currencyOf(m[0]));
  }

  // C) number + currency word: 15000 quetzales · 2000 USD
  const reC = new RegExp(String.raw`(?<![\w$])(${NUM})\s?${CUR_SUFFIX}`, 'gi');
  for (const m of text.matchAll(reC)) {
    push(m[0], m.index!, parseNumber(m[1]), currencyOf(m[0]));
  }

  // D) amounts in words: "quince mil", "veinte mil quetzales", "mil quinientos"
  const reD = new RegExp(WORDS_AMOUNT, 'gi');
  for (const m of text.matchAll(reD)) {
    // bare "mil" inside expressions like "mil gracias" is not an amount
    if (/^mil$/i.test(m[0].trim())) continue;
    if (COUNT_NOUNS.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 30).replace(/^\s*de\s+/i, ' '))) continue;
    push(m[0], m.index!, wordsValue(m[0]), currencyOf(m[0]));
  }

  // E) bare numbers >= 1000 that are not years and not counts of things: 15000 · 15.000 · 15,000
  const reE = new RegExp(String.raw`(?<![\w$.,])(${NUM})`, 'g');
  for (const m of text.matchAll(reE)) {
    const raw = m[1];
    const value = parseNumber(raw);
    if (!(value >= 1000)) continue;
    if (isYearLike(raw, value)) continue;
    const after = text.slice(m.index! + raw.length, m.index! + raw.length + 30);
    if (/^\s*%/.test(after) || COUNT_NOUNS.test(after)) continue;
    push(raw, m.index!, value, null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Employer
// ---------------------------------------------------------------------------

const CORPORATE_SUFFIX =
  /[,\s]*\b(?:s\.?\s?a\.?|sociedad an[oó]nima|ltda\.?|limitada|inc\.?|corp\.?|llc|s\.?\s?de\s?r\.?\s?l\.?)\s*$/i;
const STOP = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', '&', 'the', 'of', 'and']);
/** Tokens too generic to identify an employer on their own. */
const GENERIC = new Set(
  [
    'banco', 'grupo', 'corporacion', 'empresa', 'compania', 'servicios', 'soluciones', 'sistemas', 'tecnologia',
    'tecnologias', 'guatemala', 'guatemalteca', 'guatemalteco', 'centroamerica', 'centroamericana', 'americana',
    'centro', 'internacional', 'industrial', 'digital', 'software', 'consultores', 'consultoria', 'group', 'bank',
    'solutions', 'services', 'technologies', 'global', 'nacional', 'distribuidora', 'comercial', 'comercializadora',
    'agencia', 'agencias', 'fundacion', 'asociacion', 'universidad', 'colegio', 'hospital', 'clinica', 'ministerio',
    'municipalidad', 'cooperativa', 'financiera', 'seguros', 'aseguradora', 'inversiones', 'industrias', 'labs',
  ],
);

export interface EmployerMatcher {
  full: string;
  acronym?: string;
  aliases: string[];
  distinctive: string[];
}

function cleanCompany(name: string): string {
  let s = name.replace(/\(.*?\)/g, ' ');
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(CORPORATE_SUFFIX, '');
  }
  return normalize(s).replace(/[^a-z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildEmployerMatcher(employer: string): EmployerMatcher | null {
  if (!employer || !employer.trim()) return null;
  const full = cleanCompany(employer);
  if (!full) return null;
  const aliases = [...employer.matchAll(/\(([^)]+)\)/g)].map((m) => cleanCompany(m[1])).filter(Boolean);
  const words = full.split(' ').filter((w) => !STOP.has(w));
  const acronym = words.length >= 2 ? words.map((w) => w[0]).join('') : undefined;
  const distinctive = words.filter((w) => w.length >= 5 && !GENERIC.has(w));
  return { full, acronym, aliases, distinctive };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

interface Token {
  norm: string;
  raw: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}&]+/gu)) {
    out.push({ raw: m[0], norm: normalize(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

function findEmployer(text: string, matcher: EmployerMatcher): Finding[] {
  const out: Finding[] = [];
  const tokens = tokenize(text);
  const phrases = [matcher.full, ...matcher.aliases];
  for (const phrase of phrases) {
    const pw = phrase.split(' ');
    const n = pw.length;
    const maxDist = phrase.length >= 8 ? Math.max(1, Math.floor(phrase.length / 8)) : 0;
    for (let i = 0; i + n <= tokens.length; i++) {
      const window = tokens.slice(i, i + n);
      const candidate = window.map((t) => t.norm).join(' ');
      const d = candidate === phrase ? 0 : levenshtein(candidate, phrase);
      if (d <= maxDist) {
        const start = window[0].start;
        const end = window[n - 1].end;
        out.push({ type: 'employer', match: text.slice(start, end), index: start, rule: d === 0 ? 'employer_exact' : 'employer_fuzzy' });
      }
    }
  }
  // Written without spaces: "XelajuTech", "BancoIndustrial".
  for (const phrase of phrases) {
    const compact = phrase.replace(/\s+/g, '');
    if (compact.length < 6 || !phrase.includes(' ')) continue;
    for (const t of tokens) {
      if (t.norm === compact || (compact.length >= 10 && levenshtein(t.norm, compact) <= 1)) {
        out.push({ type: 'employer', match: t.raw, index: t.start, rule: 'employer_compact' });
      }
    }
  }
  // Acronym, case-sensitive-ish: "BI", "B.I.", "CCA". Must look like an acronym in the text (uppercase).
  if (matcher.acronym && matcher.acronym.length >= 2) {
    const letters = matcher.acronym.toUpperCase().split('');
    const re = new RegExp(String.raw`(?<![\p{L}\p{N}])${letters.join(String.raw`\.?`)}\.?(?![\p{L}\p{N}])`, 'gu');
    for (const m of text.matchAll(re)) {
      out.push({ type: 'employer', match: m[0], index: m.index!, rule: 'employer_acronym' });
    }
  }
  // Distinctive single tokens, only when written capitalised (proper noun), with 1 typo allowed if long.
  for (const t of tokens) {
    if (!/^\p{Lu}/u.test(t.raw)) continue;
    for (const d of matcher.distinctive) {
      const dist = t.norm === d ? 0 : levenshtein(t.norm, d);
      if (dist === 0 || (d.length >= 7 && dist <= 1)) {
        out.push({ type: 'employer', match: t.raw, index: t.start, rule: 'employer_token' });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const UP = 'A-ZÁÉÍÓÚÑÜ';
const LOW = 'a-záéíóúñü';
const NAME = `[${UP}][${LOW}]+(?:-[${UP}][${LOW}]+)?`;
const ci = (w: string) => `[${w[0].toUpperCase()}${w[0].toLowerCase()}]${w.slice(1)}`;
const ROLES = [
  'jefe', 'jefa', 'gerente', 'compañero', 'compañera', 'compañeros', 'colega', 'supervisor', 'supervisora',
  'director', 'directora', 'coordinador', 'coordinadora', 'líder', 'lider', 'manager', 'boss', 'mentor',
  'mentora', 'cliente', 'socio', 'socia', 'encargado', 'encargada', 'reclutador', 'reclutadora', 'recruiter',
  'contacto', 'referencia', 'jefecito', 'teammate', 'coworker',
].map(ci);
const TITLES = [
  'Lic\\.', 'Licda\\.', 'Licenciado', 'Licenciada', 'Ing\\.', 'Inga\\.', 'Ingeniero', 'Ingeniera', 'Dr\\.',
  'Dra\\.', 'Doctor', 'Doctora', 'Sr\\.', 'Sra\\.', 'Srta\\.', 'Señor', 'Señora', 'Don', 'Doña', 'Arq\\.',
  'Mr\\.', 'Mrs\\.', 'Ms\\.', 'Msc\\.', 'MSc\\.',
];
/** Capitalised words that follow a role but are not names ("Gerente General"). */
const NOT_NAMES = new Set(
  [
    'general', 'regional', 'senior', 'junior', 'tecnico', 'tecnica', 'comercial', 'ventas', 'operaciones',
    'proyecto', 'proyectos', 'ti', 'it', 'financiero', 'financiera', 'administrativo', 'administrativa',
    'recursos', 'humanos', 'marketing', 'producto', 'ingenieria', 'desarrollo', 'calidad', 'soporte', 'area',
    'equipo', 'tienda', 'sucursal', 'planta', 'logistica', 'contabilidad', 'finanzas', 'data', 'qa', 'de',
    'del', 'en', 'y', 'the', 'of', 'product', 'engineering', 'sales', 'tech', 'lead', 'principal', 'interino',
    'interina', 'nacional', 'pais', 'country', 'mi', 'su',
  ],
);

/** Words that, after "Ingeniero"/"Licenciada"…, describe a job rather than a person. */
const JOB_WORDS = new Set(
  (
    'react native backend frontend fullstack software sistemas datos cloud devops mobile web java python industrial ' +
    'civil quimico quimica electronico electronica mecanico mecanica agronomo agronoma administracion contaduria ' +
    'mercadotecnia psicologia derecho enfermeria medicina auditoria economia informatica computacion'
  ).split(' '),
);

function findPeople(text: string, ownNames: string[]): Finding[] {
  const out: Finding[] = [];
  const role = `(?:${ROLES.join('|')})`;
  // "mi jefa Ana López", "el gerente de ventas, Carlos Pérez", "my manager John Smith"
  const reRole = new RegExp(
    String.raw`\b${role}(?:[ \t]+(?:de|del|en)[ \t]+[${LOW}]+)?[ \t]*[,:(]?[ \t]+(${NAME}(?:[ \t]+${NAME}){0,2})`,
    'gu',
  );
  for (const m of text.matchAll(reRole)) {
    const name = m[1];
    const words = name.split(/[ \t]+/);
    // drop leading words that are not names
    let k = 0;
    while (k < words.length && NOT_NAMES.has(normalize(words[k]))) k++;
    if (k === words.length) continue;
    const kept = words.slice(k).join(' ');
    const index = m.index! + m[0].lastIndexOf(name) + name.indexOf(kept);
    out.push({ type: 'person_name', match: kept, index, rule: 'person_role' });
  }
  // "Lic. Juan Pérez", "Inga. María José Rodas"
  const reTitle = new RegExp(String.raw`(?:${TITLES.join('|')})[ \t]+(${NAME}(?:[ \t]+${NAME}){0,2})`, 'gu');
  for (const m of text.matchAll(reTitle)) {
    if (m[1].split(/[ \t]+/).some((w) => NOT_NAMES.has(normalize(w)) || JOB_WORDS.has(normalize(w)))) continue;
    out.push({ type: 'person_name', match: m[0], index: m.index!, rule: 'person_title' });
  }
  // The user's own name (declared in the form).
  for (const own of ownNames) {
    const cleaned = own.trim();
    if (cleaned.length < 3) continue;
    const n = normalize(cleaned);
    const tokens = tokenize(text);
    const parts = n.split(/\s+/);
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      const w = tokens.slice(i, i + parts.length);
      if (w.map((t) => t.norm).join(' ') === n) {
        out.push({ type: 'person_name', match: text.slice(w[0].start, w[w.length - 1].end), index: w[0].start, rule: 'own_name' });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact / IDs / addresses
// ---------------------------------------------------------------------------

function findRegex(text: string, re: RegExp, type: SensitiveType, rule: string, group = 0): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(re)) {
    const match = m[group];
    if (!match) continue;
    const index = m.index! + (group ? m[0].indexOf(match) : 0);
    out.push({ type, match, index, rule });
  }
  return out;
}

const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RE_DPI = /(?<!\d)\d{4}[\s-]?\d{5}[\s-]?\d{4}(?!\d)/g;
const RE_NIT_LABELED = /\bNIT\s*(?:No\.?|#|:)?\s*:?\s*(\d{1,3}(?:[.,]?\d{3}){1,3}\s*-?\s*[\dkK]|\d{5,9}-?[\dkK])(?![\w])/gi;
const RE_NIT_SHAPE = /(?<![\d-])\d{6,8}-[\dkK](?![\w-])/g;
const RE_PHONE = /(?:\+?\(?502\)?[\s.-]?)?(?<![\d-])[2-7]\d{3}[\s.-]?\d{4}(?![\d-])/g;

function findPhones(text: string): Finding[] {
  return findRegex(text, RE_PHONE, 'phone', 'phone_gt').filter((f) => {
    // "2019-2023" is a date range, not a phone.
    const digits = f.match.replace(/\D/g, '').slice(-8);
    const a = Number(digits.slice(0, 4));
    const b = Number(digits.slice(4));
    const yearish = (y: number) => y >= 1950 && y <= 2039;
    return !(yearish(a) && yearish(b) && /[-–]/.test(f.match));
  });
}

const RE_ADDRESS: [RegExp, string][] = [
  [/\bzona\s*\d{1,2}\b/gi, 'address_zona'],
  [/\b\d{1,2}[ \t]*(?:a\.?|ª|°|era\.?|ra\.?|da\.?|ta\.?|va\.?|ma\.?|na\.?)?[ \t]*(?:calle|avenida|av\.)(?:[ \t]+(?:[A-Z][ \t]+)?\d{1,3}[ \t]*-[ \t]*\d{1,3})?/gi, 'address_street_numbered'],
  [/\b(?:[Cc]alle|[Aa]venida|[Aa]v\.|[Dd]iagonal|[Bb]ulevar|[Bb]oulevard|[Bb]lvd\.?|[Cc]alzada|[Cc]allej[oó]n|[Cc]arretera)[ \t]+(?:a[ \t]+)?[\p{Lu}\d][\p{L}\d.-]*(?:[ \t]+[\p{Lu}][\p{L}]+)?(?:[ \t]+\d{1,3}[ \t]*-[ \t]*\d{1,3})?/gu, 'address_street_named'],
  [/\b(?:km\.?|kil[oó]metro)\s*\d{1,3}(?:[.,]\d)?\b/gi, 'address_km'],
  [/\b(?:[Cc]olonia|[Cc]ol\.|[Rr]esidenciales|[Rr]esidencial|[Cc]ondominio|[Bb]arrio|[Aa]ldea|[Ll]otificaci[oó]n|[Cc]ant[oó]n)[ \t]+(?:(?:[Ll]os|[Ll]as|[Ee]l|[Ll]a|[Ss]an|[Ss]anta)[ \t]+)?[\p{Lu}][\p{L}]+(?:[ \t]+[\p{Lu}][\p{L}]+){0,2}/gu, 'address_area'],
  [/\b(?:casa|apto\.?|apartamento|lote|manzana)\s*(?:no\.?|#|número)?\s*\d+[a-z]?\b/gi, 'address_unit'],
  [/(?<![\d\w-])\d{1,2}\s*-\s*\d{2}(?=\s*,?\s*zona\b)/gi, 'address_house_number'],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Find every sensitive span in `text`. Overlaps are resolved (longest / highest priority wins). */
export function findSensitive(text: string, ctx: RedactContext = {}): Finding[] {
  if (!text) return [];
  const all: Finding[] = [];
  all.push(...findRegex(text, RE_EMAIL, 'email', 'email'));
  all.push(...findRegex(text, RE_DPI, 'dpi', 'dpi_4_5_4'));
  all.push(...findRegex(text, RE_NIT_LABELED, 'nit', 'nit_labeled'));
  all.push(...findRegex(text, RE_NIT_SHAPE, 'nit', 'nit_shape'));
  all.push(...findPhones(text));
  for (const m of findMoney(text)) all.push({ type: 'salary', match: m.raw, index: m.index, rule: 'money' });
  for (const [re, rule] of RE_ADDRESS) all.push(...findRegex(text, re, 'address', rule));
  const matcher = ctx.employer ? buildEmployerMatcher(ctx.employer) : null;
  if (matcher) all.push(...findEmployer(text, matcher));
  all.push(...findPeople(text, ctx.ownNames ?? []));
  const kept = keptSpans(text, ctx.keep ?? []);
  return resolveOverlaps(
    all.filter((f) => !isInsideTag(text, f) && !kept.some(([a, b]) => f.index >= a && f.index + f.match.length <= b)),
    text,
  );
}

/** Occurrences (start, end) of the declared public strings, case/accent-insensitive. */
function keptSpans(text: string, keep: string[]): [number, number][] {
  const spans: [number, number][] = [];
  // per-character normalization keeps indices aligned with the original text
  const hay = [...text].map((ch) => normalize(ch) || ch).join('');
  for (const k of keep) {
    const needle = normalize(k.trim());
    if (needle.length < 3) continue;
    let i = hay.indexOf(needle);
    while (i >= 0) {
      spans.push([i, i + needle.length]);
      i = hay.indexOf(needle, i + 1);
    }
  }
  return spans;
}

/** Findings that fall inside an existing tag like [SALARIO] or {{NOMBRE}} are ignored (idempotence). */
function isInsideTag(text: string, f: Finding): boolean {
  for (const m of text.matchAll(/\[[A-ZÁÉÍÓÚ_]+\]|\{\{NOMBRE\}\}/g)) {
    if (f.index >= m.index! && f.index + f.match.length <= m.index! + m[0].length) return true;
  }
  return false;
}

/**
 * Overlapping findings are merged into their union span (so a partial match can never leave a
 * fragment of sensitive text behind). The merged span keeps the type of the longest finding;
 * ties are broken by PRIORITY.
 */
function resolveOverlaps(findings: Finding[], text?: string): Finding[] {
  const sorted = [...findings].sort(
    (a, b) => a.index - b.index || b.match.length - a.match.length || PRIORITY[a.type] - PRIORITY[b.type],
  );
  const kept: (Finding & { end: number; longest: number })[] = [];
  for (const f of sorted) {
    const end = f.index + f.match.length;
    const last = kept[kept.length - 1];
    if (last && f.index < last.end) {
      if (end > last.end) {
        last.end = end;
        if (text) last.match = text.slice(last.index, end);
      }
      if (f.match.length > last.longest) {
        last.longest = f.match.length;
        last.type = f.type;
        last.rule = f.rule;
      }
      continue;
    }
    kept.push({ ...f, end, longest: f.match.length });
  }
  return kept.map(({ end: _e, longest: _l, ...f }) => f);
}

export interface RedactResult {
  text: string;
  findings: Finding[];
}

/** Replace every sensitive span by its tag. The user's own name becomes NAME_PLACEHOLDER. */
export function redact(text: string, ctx: RedactContext = {}): RedactResult {
  const findings = findSensitive(text, ctx);
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.index);
    out += f.rule === 'own_name' ? NAME_PLACEHOLDER : TAGS[f.type];
    cursor = f.index + f.match.length;
  }
  out += text.slice(cursor);
  return { text: out, findings };
}

/** Utility for tests / eval: collapse digits so "Q 15 000" and "Q15000" compare equal. */
export function canonical(text: string): string {
  return collapseDigitSeparators(normalize(text)).replace(/\s+/g, ' ').trim();
}
