/**
 * ¿El texto del modelo habla de lo que le pedimos? Chequeo determinista "en tema".
 *
 * Por qué existe: en pruebas reales, qwen3.5:2b leyó "carta de interés" como carta
 * FINANCIERA (interés compuesto, IVA) y respondió fuera de tema. Por eso los prompts dicen
 * "carta de presentación" y además validamos la salida con dos listas de raíces: debe tocar
 * al menos 2 temas de negociación salarial y ninguno de finanzas bancarias.
 * Por qué no necesita modelo: son listas de palabras explícitas; baratas y auditables.
 */
const ON_TOPIC: Array<[string, RegExp]> = [
  ["salario", /salari|sueldo|salary/i],
  ["expectativa", /expectativa|pretensi[oó]n|expectation/i],
  ["negociación", /negoci/i],
  ["oferta", /oferta|offer/i],
  ["entrevista", /entrevista|interview|reclutador|RR\.? ?HH|recursos humanos/i],
  ["aumento", /aumento|incremento|brecha|subir|raise/i],
  ["rango", /rango|range/i],
  ["logros", /logro|resultado|impacto|evidencia|achievement/i],
];

const OFF_TOPIC: Array<[string, RegExp]> = [
  ["interés compuesto", /inter[eé]s(es)? compuesto/i],
  ["tasa de interés", /tasa(s)? de inter[eé]s|interest rate/i],
  ["IVA", /\bIVA\b/],
  ["préstamo", /pr[eé]stamo|hipoteca|amortizaci|loan/i],
  ["banca", /cuenta de ahorro|plazo fijo|cr[eé]dito bancario/i],
];

export interface TopicResult {
  onTopic: boolean;
  hits: string[];
  offTopicHits: string[];
}

export function checkOnTopic(text: string, minHits = 2): TopicResult {
  const hits = ON_TOPIC.filter(([, re]) => re.test(text)).map(([k]) => k);
  const offTopicHits = OFF_TOPIC.filter(([, re]) => re.test(text)).map(([k]) => k);
  return { onTopic: hits.length >= minHits && offTopicHits.length === 0, hits, offTopicHits };
}
