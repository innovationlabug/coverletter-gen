import type { Currency } from './types';

/**
 * Documented exchange constant used ONLY by the local negotiation note to compare
 * salaries expressed in different currencies.
 *
 * 1 USD = 7.70 GTQ. It is a deliberately rounded reference (Banco de Guatemala's
 * reference rate has hovered around 7.6–7.8 GTQ/USD for years). The note shows the
 * constant to the user; it is not a live rate and does not need to be one: the bands
 * of the negotiation note are 10–15 percentage points wide, so a ±2 % error in the
 * rate does not change the advice.
 */
export const USD_TO_GTQ = 7.7;

export const CURRENCY_SYMBOL: Record<Currency, string> = { GTQ: 'Q', USD: 'US$' };

export function toGTQ(amount: number, currency: Currency): number {
  return currency === 'USD' ? amount * USD_TO_GTQ : amount;
}

export function formatMoney(amount: number, currency: Currency): string {
  const n = Math.round(amount).toLocaleString('en-US');
  return `${CURRENCY_SYMBOL[currency]}${n}`;
}

/** Remove accents and lowercase. Shared normalization for all case/accent-insensitive matching. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Collapse thousands separators inside numbers so "15,000", "15.000" and "15 000"
 * all become "15000". Decimal parts ("15,000.50") keep their last separator.
 */
export function collapseDigitSeparators(text: string): string {
  let prev = '';
  let out = text;
  while (prev !== out) {
    prev = out;
    out = out.replace(/(\d)[\s.,'](?=\d{3}(?!\d))/g, '$1');
  }
  return out;
}

const UNITS = [
  'cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiun', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete',
  'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos',
];

function below1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 30) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(' ');
}

/**
 * Spanish words for an integer < 1,000,000, accent-free (matching is done on
 * normalized text). 15000 → "quince mil", 12500 → "doce mil quinientos".
 */
export function spanishWords(n: number): string {
  n = Math.round(n);
  if (n === 0) return 'cero';
  if (n >= 1_000_000) return String(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (thousands === 1) parts.push('mil');
  else if (thousands > 1) parts.push(`${below1000(thousands)} mil`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/**
 * Every "written form" of an amount that we consider a leak of that amount.
 * Returned in normalized form (lowercase, no accents, digit separators collapsed),
 * so callers must normalize the haystack with `normalizeForAmountSearch`.
 */
export function amountVariants(amount: number): string[] {
  const n = Math.round(amount);
  const v = new Set<string>();
  v.add(String(n));
  if (n >= 1000) {
    const k = n / 1000;
    const kStr = Number.isInteger(k) ? String(k) : String(k).replace('.', '[.,]');
    v.add(`${kStr}k`);
    v.add(`${kStr} k`);
    v.add(`${kStr} mil`);
    v.add(`${kStr}mil`);
    if (!Number.isInteger(k)) {
      // "12 mil 500"
      v.add(`${Math.floor(k)} mil ${n % 1000}`);
    }
  }
  v.add(spanishWords(n));
  return [...v];
}

export function normalizeForAmountSearch(text: string): string {
  return collapseDigitSeparators(normalize(text)).replace(/\s+/g, ' ');
}

/** True if `haystack` contains the amount written in any of its forms. */
export function containsAmount(haystack: string, amount: number): string | null {
  if (!amount || amount <= 0) return null;
  const h = normalizeForAmountSearch(haystack);
  for (const variant of amountVariants(amount)) {
    const re = new RegExp(`(^|[^\\d.,])${variant.replace(/ /g, '\\s*')}(?![\\d])`, 'i');
    if (/^[a-z ]+$/.test(variant)) {
      // word form: require word boundaries
      if (new RegExp(`\\b${variant}\\b`).test(h)) return variant;
    } else if (re.test(h)) {
      return variant;
    }
  }
  return null;
}
