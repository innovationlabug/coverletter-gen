/**
 * Minúsculas + sin tildes, preservando la longitud (1 carácter → 1 carácter) para que
 * las posiciones encontradas en el texto "doblado" sirvan para reemplazar en el original.
 */
export function foldPreservingLength(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    out += base.length === ch.length ? base : ch.length === 1 ? ch.toLowerCase().slice(0, 1) || ch : ch;
  }
  return out;
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
