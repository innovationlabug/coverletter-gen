/**
 * Extracción de requisitos SIN modelo (respaldo cuando Ollama no responde u offline).
 *
 * Por qué no necesita modelo: casi todas las ofertas listan requisitos en viñetas después de
 * un encabezado ("Requisitos", "Requirements", "Buscamos"). Tomar esas líneas es 100 %
 * fiel al texto (cero alucinación); el modelo solo agrega normalización y clasificación
 * must/nice, que es un lujo, no una necesidad.
 */
const BULLET_RE = /^\s*(?:[-*•·▪◦–]|\d+[.)])\s+(.{3,160})$/;

export function extractRequirementsHeuristic(offer: string | undefined, max = 8): string[] {
  if (!offer) return [];
  const bullets: string[] = [];
  for (const line of offer.split(/\r?\n/)) {
    const m = BULLET_RE.exec(line);
    if (m) bullets.push(m[1].trim().replace(/[.;]$/, ""));
  }
  return [...new Set(bullets)].slice(0, max);
}
