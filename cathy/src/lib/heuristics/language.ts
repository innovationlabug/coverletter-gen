import type { Language } from "../types";

/**
 * Idioma de la oferta (es/en) por conteo de palabras vacías.
 *
 * Por qué no necesita modelo: en textos de más de ~20 palabras, las palabras funcionales
 * ("de", "la", "que" vs "the", "and", "you") separan español e inglés con un margen enorme.
 * Solo hay dos clases y el costo de equivocarse es bajo (la carta sale en el otro idioma).
 */
const ES = ["de", "la", "que", "el", "en", "y", "los", "las", "para", "con", "una", "por", "del", "se", "experiencia", "años", "requisitos", "conocimientos"];
const EN = ["the", "and", "of", "to", "you", "with", "for", "our", "we", "is", "are", "will", "experience", "years", "requirements", "skills"];

export function detectLanguage(text: string | undefined, fallback: Language = "es"): Language {
  if (!text || !text.trim()) return fallback;
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let es = 0;
  let en = 0;
  for (const w of words) {
    if (ES.includes(w)) es++;
    if (EN.includes(w)) en++;
  }
  if (es === en) return fallback;
  return en > es ? "en" : "es";
}
