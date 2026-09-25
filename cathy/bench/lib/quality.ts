import type { Profile } from "../../src/lib/types";
import { computeFacts, numberReference } from "../../src/lib/facts";
import { checkNumberConsistency } from "../../src/lib/heuristics/consistency";
import { detectLanguage } from "../../src/lib/heuristics/language";
import { checkOnTopic } from "../../src/lib/heuristics/topic";
import { extractRequirementsHeuristic } from "../../src/lib/heuristics/requirements";
import { findMoneyMentions } from "../../src/lib/heuristics/money";
import { fold } from "../../src/lib/heuristics/fold";
import { parseRequirements } from "../../src/lib/tasks";

/** Chequeos deterministas de calidad: reutilizan las MISMAS heurísticas de la app. */

const FIRST_PERSON_RE = /\b(mi|mis) (expectativa|salario|sueldo|logros?|experiencia|perfil|desempeño|capacidad)\b|\bme (preguntan|pregunten)\b/i;

export const NOTE_WORDS = { min: 60, max: 220 }; // el prompt pide 90–170; damos tolerancia

export interface NegotiationQuality {
  spanish: boolean;
  words: number;
  lengthOk: boolean;
  numbersChecked: number;
  inventedNumbers: number;
  numbersConsistent: boolean;
  onTopic: boolean;
  offTopicHits: string[];
  noMarkdown: boolean;
  /** Le habla a la persona ("tu expectativa"), no escribe como si fuera ella ("mi expectativa"). */
  secondPerson: boolean;
  /** Fracción de chequeos aprobados (español, largo, números, en tema, sin markdown, 2.ª persona). */
  score: number;
}

export function negotiationQuality(text: string, profile: Profile): NegotiationQuality {
  const facts = computeFacts(profile);
  const words = (text.match(/\S+/g) ?? []).length;
  const numbers = checkNumberConsistency(text, numberReference(facts, [profile.achievements, profile.jobOffer]));
  const topic = checkOnTopic(text);
  const q = {
    spanish: detectLanguage(text, "en") === "es",
    words,
    lengthOk: words >= NOTE_WORDS.min && words <= NOTE_WORDS.max,
    numbersChecked: numbers.checked,
    inventedNumbers: numbers.flagged.length,
    numbersConsistent: numbers.ok,
    onTopic: topic.onTopic,
    offTopicHits: topic.offTopicHits,
    noMarkdown: !/(^|\n)\s*(#|\*\s|-\s)|\*\*/.test(text),
    // Hallazgo de la primera corrida real: gemma escribió 7 de 12 notas en primera persona.
    secondPerson: !FIRST_PERSON_RE.test(text),
  };
  const checks = [q.spanish, q.lengthOk, q.numbersConsistent, q.onTopic, q.noMarkdown, q.secondPerson];
  return { ...q, score: checks.filter(Boolean).length / checks.length };
}

const tokens = (s: string) => fold(s).match(/\p{L}{4,}|\d+/gu) ?? [];

function overlap(item: string, reference: string): number {
  const t = tokens(item);
  if (!t.length) return 0;
  const ref = new Set(tokens(reference));
  return t.filter((w) => ref.has(w)).length / t.length;
}

export interface RequirementsQuality {
  jsonValid: boolean;
  schemaValid: boolean;
  items: number;
  /** Fracción de ítems cuyas palabras (≥ 50 %) están en la oferta: mide alucinación. */
  grounding: number | null;
  /** Fracción de viñetas de la oferta cubiertas por algún ítem extraído. */
  recall: number | null;
  mentionsSalary: boolean;
  score: number;
}

export function requirementsQuality(content: string, offer: string): RequirementsQuality {
  const parsed = parseRequirements(content);
  if (!parsed.value) {
    return { jsonValid: parsed.jsonValid, schemaValid: false, items: 0, grounding: null, recall: null, mentionsSalary: false, score: parsed.jsonValid ? 0.25 : 0 };
  }
  const items = [...parsed.value.must, ...parsed.value.nice];
  const grounded = items.filter((i) => overlap(i, offer) >= 0.5).length;
  const bullets = extractRequirementsHeuristic(offer, 50);
  const covered = bullets.filter((b) => items.some((i) => overlap(b, i) >= 0.5 || overlap(i, b) >= 0.5)).length;
  const grounding = items.length ? grounded / items.length : null;
  const recall = bullets.length ? covered / bullets.length : null;
  const mentionsSalary = items.some((i) => findMoneyMentions(i).some((m) => m.isMoney) || /salari|sueldo|salary/i.test(i));
  const parts = [1, 1, grounding ?? 0, recall ?? 1, mentionsSalary ? 0 : 1];
  return { jsonValid: true, schemaValid: true, items: items.length, grounding, recall, mentionsSalary, score: parts.reduce((a, b) => a + b, 0) / parts.length };
}
