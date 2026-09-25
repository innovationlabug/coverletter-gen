import type { Currency } from "../types";

/**
 * Detector de montos de dinero en texto libre (español de Guatemala + inglés).
 *
 * Por qué no necesita modelo: los montos se escriben en un conjunto finito de formas
 * (Q15,000 · Q 15 000 · 15000 · $2,000 · USD 2000 · 15 mil · 15k · quince mil). Una
 * expresión regular las cubre todas de forma determinista, auditable y con pruebas; un
 * modelo pequeño "casi siempre" las detecta, y "casi siempre" no sirve para privacidad.
 */

export interface MoneyMention {
  start: number;
  end: number;
  raw: string;
  /** Valor numérico ya con multiplicador (15k → 15000). NaN si no se pudo calcular. */
  value: number;
  currency: Currency | null;
  /** Tiene marca de moneda (Q, $, USD, quetzales…) o multiplicador (k, mil). */
  marked: boolean;
  /** Parece dinero: marcado, o número "grande" (≥ 4 dígitos) que no es un año. */
  isMoney: boolean;
  /** Número escrito con palabras ("quince mil"). */
  spelled: boolean;
}

const NUM = String.raw`\d{1,3}(?:(?:,|\.|[  ](?=\d{3}(?!\d)))\d{3})+(?:[.,]\d{1,2}(?!\d))?|\d+(?:[.,]\d{1,2}(?!\d))?`;
const PRE = String.raw`(?:GTQ|USD|US\$|Q\.?|\$)[  ]?`;
const MULT = String.raw`[  ]?(?:[kK]|mil)(?![\p{L}\d])`;
const SUF = String.raw`[  ]?(?:quetzales|quetzal|GTQ|USD|d[oó]lares|dólar|dolar|dls\.?)(?![\p{L}])`;

const MONEY_RE = new RegExp(
  String.raw`(?<![\p{L}\d.,])(?<pre>${PRE})?(?<num>${NUM})(?<mult>${MULT})?(?<suf>${SUF})?(?![\p{L}\d%])(?![  ]?%)`,
  "gu",
);

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, "dieciséis": 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  "veintidós": 22, veintitres: 23, "veintitrés": 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, "veintiséis": 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100,
};
const WORDS = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const SPELLED_RE = new RegExp(
  String.raw`(?<![\p{L}])(?<w1>${WORDS})(?:\s+y\s+(?<w2>${WORDS}))?\s+mil(?![\p{L}])(?<suf>\s+(?:quetzales|d[oó]lares))?`,
  "giu",
);

/** "15,000.50" → 15000.5 · "15.000" → 15000 · "15 000" → 15000 · "15,5" → 15.5 */
export function parseNumber(num: string): number {
  const s = num.replace(/ /g, " ").trim();
  const grouped = /^(\d{1,3})((?:[., ]\d{3})+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (grouped) {
    const intPart = grouped[1] + grouped[2].replace(/[., ]/g, "");
    return Number(intPart + (grouped[3] ? "." + grouped[3] : ""));
  }
  return Number(s.replace(",", "."));
}

function currencyFrom(pre?: string, suf?: string): Currency | null {
  const tag = `${pre ?? ""} ${suf ?? ""}`.toLowerCase();
  if (/usd|\$|d[oó]lar|dls/.test(tag)) return "USD";
  if (/gtq|q|quetzal/.test(tag)) return "GTQ";
  return null;
}

function isYearLike(num: string, value: number): boolean {
  return /^\d{4}$/.test(num) && value >= 1950 && value <= 2099;
}

export function findMoneyMentions(text: string): MoneyMention[] {
  const out: MoneyMention[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const g = m.groups ?? {};
    const base = parseNumber(g.num);
    const hasMult = Boolean(g.mult);
    const value = hasMult ? base * 1000 : base;
    const marked = Boolean(g.pre || g.suf || hasMult);
    const intDigits = g.num.split(/[.,](?=\d{1,2}$)/)[0].replace(/\D/g, "").length;
    const isMoney = marked || (intDigits >= 4 && !isYearLike(g.num, value));
    out.push({
      start: m.index!,
      end: m.index! + m[0].length,
      raw: m[0],
      value,
      currency: currencyFrom(g.pre, g.suf),
      marked,
      isMoney,
      spelled: false,
    });
  }
  for (const m of text.matchAll(SPELLED_RE)) {
    const g = m.groups ?? {};
    const w1 = NUMBER_WORDS[g.w1.toLowerCase()] ?? NaN;
    const w2 = g.w2 ? (NUMBER_WORDS[g.w2.toLowerCase()] ?? NaN) : 0;
    out.push({
      start: m.index!,
      end: m.index! + m[0].length,
      raw: m[0],
      value: (w1 + w2) * 1000,
      currency: currencyFrom(undefined, g.suf),
      marked: true,
      isMoney: true,
      spelled: true,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Interpreta lo que la persona escribe en el campo de salario: "Q15,000", "15k", "USD 2000"…
 * Devuelve null si no hay un número reconocible.
 */
export function parseMoney(
  input: string,
  fallbackCurrency: Currency = "GTQ",
): { amount: number; currency: Currency } | null {
  const mentions = findMoneyMentions(input.trim());
  const m = mentions.find((x) => x.isMoney) ?? mentions[0];
  if (!m || !Number.isFinite(m.value) || m.value <= 0) return null;
  return { amount: m.value, currency: m.currency ?? fallbackCurrency };
}

/** Todas las formas escritas de un monto (para pruebas de fuga y para el redactor). */
export function writtenForms(amount: number): string[] {
  const int = Math.round(amount);
  const comma = int.toLocaleString("en-US");
  const dot = comma.replace(/,/g, ".");
  const space = comma.replace(/,/g, " ");
  const forms = new Set<string>([String(int), comma, dot, space, `Q${comma}`, `Q ${space}`, `Q${int}`, `$${comma}`, `USD ${int}`]);
  if (int % 1000 === 0) {
    const k = int / 1000;
    forms.add(`${k}k`);
    forms.add(`${k} mil`);
    forms.add(`${k}K`);
  }
  return [...forms];
}
