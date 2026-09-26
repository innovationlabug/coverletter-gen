/**
 * Formato de montos mientras se escriben: "15000" → "15,000".
 * Solo toca lo que es claramente un número (dígitos, comas y hasta dos decimales). Si la persona
 * escribe otra cosa ("15k", "USD 2000", "15 mil") se deja tal cual: parseMoney lo entiende igual.
 */
export function formatMoneyInput(raw: string): string {
  const m = /^([\d,]*)(\.\d{0,2})?$/.exec(raw.trim());
  if (!m) return raw;
  const digits = m[1].replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return m[2] ? `0${m[2]}` : "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (m[2] ?? "");
}

/**
 * Posición del cursor después de formatear: se conserva la cantidad de dígitos que había a su
 * izquierda, así escribir o borrar en medio del número no manda el cursor al final.
 */
export function caretAfterFormat(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++;
    if (seen === digitsBefore) return i + 1;
  }
  return formatted.length;
}

export function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/** "Cervecería Centro Americana" → "cerveceria-centro-americana" (para el nombre del archivo). */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
