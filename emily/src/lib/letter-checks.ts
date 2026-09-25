/**
 * Deterministic letter checks. Used by the UI (badges under each letter) and by the
 * evaluation harness (eval/), where they are reported next to the Gemini-as-judge scores.
 * See eval/CRITERIOS.md for the justification of each criterion.
 */
import { collapseDigitSeparators, containsAmount, normalize } from './money';
import { findSensitive } from './redact';
import { extractKeywords, wordCount } from './text';
import type { Profile, SensitiveType } from './types';

export type CriterionId = 'ajuste_oferta' | 'cero_inventados' | 'tono' | 'longitud' | 'espanol' | 'cta';

export const CRITERIA: { id: CriterionId; label: string }[] = [
  { id: 'ajuste_oferta', label: 'Ajuste a la oferta' },
  { id: 'cero_inventados', label: 'Cero datos inventados' },
  { id: 'tono', label: 'Tono profesional' },
  { id: 'longitud', label: 'Longitud 250–400' },
  { id: 'espanol', label: 'Español correcto' },
  { id: 'cta', label: 'Cierre con llamada a la acción' },
];

export interface CheckResult {
  pass: boolean;
  detail: string;
}

export const MIN_WORDS = 250;
export const MAX_WORDS = 400;

export const CTA_RE =
  /(entrevista|conversar|conversaci[oó]n|platicar|reuni[oó]n|reunirnos|llamada|quedo (atent[oa]|a (su|la|tu) (entera )?disposici[oó]n)|me encantar[ií]a (conversar|platicar|reunirme|comentar|ampliar|conocer)|agendar|coordinar una|contactarme|comunicarse conmigo)/i;

const INFORMAL_RE =
  /(\bvos\b|\bten[eé]s\b|\bpod[eé]s\b|\bquer[eé]s\b|\bchilero\b|\bxd\b|\bjaja|\bbro\b|\bs[uú]per\b|!!|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|\*\*|^#+\s|\[[A-ZÁÉÍÓÚ_]+\]|\{\{)/imu;

const ENGLISH_WORDS = new Set(
  'the and with for you your our this that have has are was were will would from team skills experience role company looking forward dear sincerely regards'.split(' '),
);
/** Common words that are misspelled when written without their accent. */
const MISSING_ACCENT = [
  'informacion', 'tambien', 'atencion', 'organizacion', 'gestion', 'comunicacion', 'solucion', 'posicion',
  'direccion', 'dias', 'analisis', 'tecnologia', 'compania', 'podria', 'aqui', 'segun', 'optimizacion',
  'implementacion', 'automatizacion', 'administracion', 'operacion', 'consideracion', 'exito', 'area', 'areas',
  'logistica', 'numero', 'rapido', 'dinamico', 'estrategico', 'tecnico', 'academico', 'economico', 'energia',
  'metodologia', 'disposicion', 'aplicacion', 'trayectoria profesional y tecnica',
]
  .filter((w) => !/ /.test(w))
  // \b is ASCII-only in JS: use explicit non-letter guards so "información" does not match "informacion".
  .map((w) => new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, 'gu'));

/** Words that commonly appear capitalised in any letter and are not "invented entities". */
const COMMON_CAPS = new Set(
  (
    'estimado estimada estimados equipo atentamente cordialmente saludos me mi en el la los las de del por para con ' +
    'como durante actualmente quedo agradezco considero estoy es soy he tengo creo estas este esta entre al ademas ' +
    'asimismo finalmente sin gracias muchas les su sus a y o que desde mis lo una un recursos humanos guatemala ' +
    'señores señoras sres a/c ing lic licda hola buen buenas espero confio deseo cuento tras gerencia nuestra nuestro ' +
    'departamento seleccion talento humano mediante aprovecho adjunto escribo reciban fue ha hemos'
  ).split(/\s+/),
);

function inputCorpus(p: Profile): string {
  return [p.nombre, p.puestoActual, p.empleadorActual, p.puestoDeseado, p.empresaDestino, p.logros, p.oferta ?? '', String(p.aniosExperiencia)].join('\n');
}

/** Numbers (digits) in the letter that do not appear in the user's input. */
export function inventedNumbers(letter: string, p: Profile): string[] {
  const inputNums = new Set((collapseDigitSeparators(inputCorpus(p)).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  const out: string[] = [];
  for (const n of collapseDigitSeparators(letter).match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const k = n.replace(',', '.');
    if (!inputNums.has(k) && !inputNums.has(String(Number(k)))) out.push(n);
  }
  return out;
}

/** Capitalised words mid-sentence that do not appear anywhere in the input (proxy for invented entities). */
export function unknownProperNouns(letter: string, p: Profile): string[] {
  const corpus = normalize(inputCorpus(p));
  const out = new Set<string>();
  for (const m of letter.matchAll(/(?<=[\p{Ll},;:]\s+)(\p{Lu}[\p{L}\d]+(?:\s+\p{Lu}[\p{L}\d]+)*)/gu)) {
    for (const w of m[1].split(/\s+/)) {
      const n = normalize(w);
      if (COMMON_CAPS.has(n) || n.length < 3) continue;
      if (!corpus.includes(n.slice(0, Math.max(4, n.length - 2)))) out.add(w);
    }
  }
  return [...out];
}

/** Sensitive things that must never appear in any letter (salaries, contact data, IDs, third parties). */
export function forbiddenContent(letter: string, p: Profile): string[] {
  const out: string[] = [];
  for (const amount of [p.salarioActual, p.salarioDeseado]) {
    const hit = containsAmount(letter, amount);
    if (hit) out.push(`salario:${hit}`);
  }
  const banned: SensitiveType[] = ['salary', 'phone', 'email', 'dpi', 'nit', 'address', 'person_name'];
  for (const f of findSensitive(letter, { ownNames: [p.nombre], keep: [p.empresaDestino, p.puestoDeseado] })) {
    if (f.rule === 'own_name') continue;
    if (banned.includes(f.type)) out.push(`${f.type}:${f.match}`);
  }
  if (/\[[A-ZÁÉÍÓÚ_]+\]|\{\{\s*NOMBRE\s*\}\}/.test(letter)) out.push('etiqueta_sin_reemplazar');
  return out;
}

export function checkLetter(letter: string, p: Profile): Record<CriterionId, CheckResult> {
  const words = wordCount(letter);
  const n = normalize(letter);

  // 1. Fit to the offer: target company + role mentioned, and >=30 % of the offer's salient words.
  const empresaOk = !p.empresaDestino || n.includes(normalize(p.empresaDestino).split(/\s+/)[0]);
  const puestoWords = normalize(p.puestoDeseado).split(/\s+/).filter((w) => w.length >= 4);
  const puestoOk = puestoWords.length === 0 || puestoWords.some((w) => n.includes(w));
  const kws = extractKeywords(p.oferta, 10);
  const hits = kws.filter((k) => n.includes(k.slice(0, Math.max(5, k.length - 2))));
  const kwRatio = kws.length ? hits.length / kws.length : 1;
  const ajuste: CheckResult = {
    pass: empresaOk && puestoOk && kwRatio >= 0.3,
    detail: `empresa:${empresaOk ? 'sí' : 'no'} puesto:${puestoOk ? 'sí' : 'no'} palabras clave oferta ${hits.length}/${kws.length}`,
  };

  // 2. Nothing invented + nothing forbidden.
  const inv = inventedNumbers(letter, p);
  const forb = forbiddenContent(letter, p);
  const unk = unknownProperNouns(letter, p);
  const inventados: CheckResult = {
    pass: inv.length === 0 && forb.length === 0 && unk.length <= 2,
    detail: `números nuevos:[${inv.join(', ')}] prohibido:[${forb.join(', ')}] nombres propios no presentes:[${unk.join(', ')}]`,
  };

  // 3. Tone.
  const informal = letter.match(INFORMAL_RE);
  const greeting = /^(estimad[oa]s?|señor|señora|sres|a quien corresponda|apreciad[oa]s?)/im.test(letter);
  const tono: CheckResult = {
    pass: !informal && greeting,
    detail: `${informal ? `informal:"${informal[0]}" ` : ''}saludo formal:${greeting ? 'sí' : 'no'}`,
  };

  // 4. Length.
  const longitud: CheckResult = { pass: words >= MIN_WORDS && words <= MAX_WORDS, detail: `${words} palabras` };

  // 5. Spanish (proxy): little English, no accent-less common words, not truncated.
  const tokens = n.match(/[a-z]+/g) ?? [];
  const eng = tokens.filter((t) => ENGLISH_WORDS.has(t)).length / Math.max(1, tokens.length);
  const accentless = MISSING_ACCENT.reduce((acc, re) => acc + (letter.toLowerCase().match(re)?.length ?? 0), 0);
  const truncated = !/[.!?:)\p{L}]\s*$/u.test(letter.trim());
  const espanol: CheckResult = {
    pass: eng < 0.03 && accentless === 0 && !truncated,
    detail: `inglés ${(eng * 100).toFixed(1)} % · palabras sin tilde ${accentless}${truncated ? ' · truncada' : ''}`,
  };

  // 6. Call to action in the last 40 % of the letter.
  const tail = letter.slice(Math.floor(letter.length * 0.6));
  const cta: CheckResult = { pass: CTA_RE.test(tail), detail: CTA_RE.test(tail) ? 'invita a conversar' : 'sin llamada a la acción al cierre' };

  return { ajuste_oferta: ajuste, cero_inventados: inventados, tono, longitud, espanol, cta };
}
