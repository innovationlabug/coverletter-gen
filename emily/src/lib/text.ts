import { normalize } from './money';

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []).length;
}

/** Spanish + English stopwords (normalized) for keyword extraction. */
const STOPWORDS = new Set(
  (
    'para como pero porque sobre entre desde hasta donde cuando mientras tambien ademas nuestro nuestra nuestros ' +
    'nuestras usted ustedes ellos ellas este esta estos estas aquel aquella tener tiene tienen sera seran puede ' +
    'pueden debe deben forma parte cada todos todas otro otra otros otras mismo misma mucho mucha muy mas menos ' +
    'sera siendo estar estamos buscamos buscando ofrecemos requisitos requerimos deseable indispensable empresa ' +
    'puesto trabajo equipo experiencia anos minimo minima conocimiento conocimientos manejo nivel area areas ' +
    'about with from that this will have your their they which would there other into more than such been ' +
    'years experience team work role company requirements required preferred skills ability strong using ' +
    'including within across plus must should candidate candidates looking join guatemala salario sueldo ' +
    'enviar correo interesados aplicar beneficios prestaciones ley lunes viernes horario'
  ).split(/\s+/),
);

/** Up to `max` salient content words from an offer (normalized, >= 5 letters, by frequency). */
export function extractKeywords(text: string | undefined, max = 12): string[] {
  if (!text) return [];
  const counts = new Map<string, number>();
  for (const raw of text.match(/[\p{L}][\p{L}\p{N}+#.]*/gu) ?? []) {
    const w = normalize(raw).replace(/\.+$/, '');
    if (w.length < 5 || STOPWORDS.has(w) || /^\d/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

/** Split free text into sentences / bullet items. */
export function splitItems(text: string): string[] {
  return text
    .split(/\n+|(?<=[.;!?])\s+|\s+[•·*-]\s+/)
    .map((s) => s.replace(/^[\s•·*\-–—\d.)]+/, '').trim())
    .filter((s) => s.length > 3);
}

/** Bullet-like requirement lines from an offer (first `max`). */
export function offerRequirements(offer: string | undefined, max = 3): string[] {
  if (!offer) return [];
  const lines = offer
    .split(/\n/)
    .filter((l) => /^\s*[-•·*–]\s+|^\s*\d+[.)]\s+/.test(l))
    .map((l) => l.replace(/^\s*(?:[-•·*–]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length > 4 && l.length < 140);
  return lines.slice(0, max);
}
