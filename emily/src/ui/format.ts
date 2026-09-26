/**
 * Pure helpers for the form UI: amounts formatted as you type, and file names.
 * Kept free of DOM access so they can be unit-tested.
 */

const MAX_DIGITS = 10;

/** "15000" → "15,000" (Guatemala writes thousands with a comma). */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Reformat a money input after an edit, keeping the caret next to the same digit.
 * Only whole amounts: monthly salaries are written without cents. When the edit is a paste,
 * trailing cents ("15,000.50") are dropped instead of being glued to the amount.
 */
export function formatAmountInput(
  raw: string,
  caret: number,
  opts: { pasted?: boolean } = {},
): { value: string; caret: number } {
  let text = raw;
  if (opts.pasted) {
    const cents = /[.,]\d{1,2}\s*$/.exec(text);
    // "15,000.50" / "15000.5" → drop the cents; "15.000" (thousands) is left alone.
    if (cents) text = text.slice(0, cents.index);
  }
  const digitsBeforeCaret = Math.min(countDigits(text.slice(0, caret)), MAX_DIGITS);
  const digits = text.replace(/\D/g, '').slice(0, MAX_DIGITS);
  const value = groupThousands(digits);
  return { value, caret: caretAfterDigits(value, digitsBeforeCaret) };
}

/** Digits only, at most `max` of them (years of experience). */
export function formatIntegerInput(raw: string, max = 2): string {
  return raw.replace(/\D/g, '').slice(0, max);
}

function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

function caretAfterDigits(value: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i]) && ++seen === n) return i + 1;
  }
  return value.length;
}

/** "Telus International, S.A." → "carta-telus-international-s-a.txt" */
export function letterFileName(company: string): string {
  const slug = company
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug ? `carta-${slug}.txt` : 'carta-de-interes.txt';
}
