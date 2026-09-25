/**
 * Gemini-as-judge. Blind: letters are labelled A/B/C in a per-case shuffled order (seeded by the
 * case id, so reruns are reproducible) and the judge is never told which generator wrote which.
 * temperature 0, JSON output constrained by a response schema.
 */
import { createHash } from 'node:crypto';
import { Type } from '@google/genai';
import type { CriterionId } from '../../src/lib/letter-checks';
import type { Profile } from '../../src/lib/types';
import { getVertex, VERTEX, withRetry, type Source } from './letters';

export const RUBRIC: Record<CriterionId, { nombre: string; anclas: [string, string, string] }> = {
  ajuste_oferta: {
    nombre: 'Ajuste a la oferta',
    anclas: [
      '1 = genérica: podría enviarse a cualquier empresa; no usa la oferta ni el puesto.',
      '3 = menciona el puesto y la empresa y algún requisito, pero sin conectarlo con experiencia concreta.',
      '5 = conecta explícitamente varios requisitos de la oferta (o del puesto, si no hay oferta) con experiencias y logros concretos del candidato.',
    ],
  },
  cero_inventados: {
    nombre: 'Cero datos inventados',
    anclas: [
      '1 = inventa cifras, empleadores, títulos, certificaciones o logros que no están en los datos, o menciona salarios.',
      '3 = sin cifras ni entidades inventadas, pero con afirmaciones concretas no respaldadas por los datos.',
      '5 = todo dato verificable (cifras, empresas, herramientas, títulos, logros) aparece en los datos del candidato. Omitir datos NO se penaliza.',
    ],
  },
  tono: {
    nombre: 'Tono profesional',
    anclas: [
      '1 = informal, servil, agresivo o con exageraciones graves.',
      '3 = correcto pero rígido, lleno de clichés o con alguna exageración.',
      '5 = profesional, cálido y seguro; trata de usted; sin exageraciones.',
    ],
  },
  longitud: {
    nombre: 'Longitud 250–400 palabras',
    anclas: [
      '1 = claramente fuera de rango (menos de 180 o más de 480 palabras).',
      '3 = ligeramente fuera de rango (180–249 o 401–480 palabras).',
      '5 = entre 250 y 400 palabras.',
    ],
  },
  espanol: {
    nombre: 'Español correcto',
    anclas: [
      '1 = errores frecuentes de ortografía o gramática, o mezcla de idiomas.',
      '3 = algunos errores menores (tildes, concordancia, puntuación).',
      '5 = sin errores; tildes y puntuación correctas.',
    ],
  },
  cta: {
    nombre: 'Cierre con llamada a la acción',
    anclas: [
      '1 = no tiene cierre o termina abruptamente.',
      '3 = cierre cortés sin invitación clara a un siguiente paso.',
      '5 = invita explícitamente a una entrevista o conversación y agradece.',
    ],
  },
};

const CRITERIA = Object.keys(RUBRIC) as CriterionId[];

export interface JudgeScores {
  label: string;
  scores: Record<CriterionId, number>;
  comentario: string;
}

export interface JudgeResult {
  mapping: Record<string, Source>;
  byLabel: JudgeScores[];
  bySource: Partial<Record<Source, JudgeScores>>;
  latencyMs: number;
  usage?: { promptTokens?: number; outputTokens?: number; thoughtsTokens?: number };
  error?: string;
}

/** Deterministic shuffle seeded by the case id. */
export function blindOrder<T>(items: T[], seed: string): T[] {
  const h = createHash('sha256').update(seed).digest();
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = h[i % h.length] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function facts(p: Profile): string {
  return [
    `Puesto actual: ${p.puestoActual}`,
    `Empleador actual: ${p.empleadorActual}`,
    `Años de experiencia: ${p.aniosExperiencia}`,
    `Puesto al que aplica: ${p.puestoDeseado}`,
    `Empresa destino: ${p.empresaDestino}`,
    `Nombre del candidato: ${p.nombre}`,
    'Logros (texto del candidato):',
    p.logros,
    p.oferta ? `Oferta:\n${p.oferta}` : 'Oferta: no se proporcionó.',
  ].join('\n');
}

export function judgePrompt(p: Profile, letters: { label: string; text: string }[]): { system: string; user: string } {
  const rubric = CRITERIA.map((c) => `- ${c} (${RUBRIC[c].nombre}):\n  ${RUBRIC[c].anclas.join('\n  ')}`).join('\n');
  const system = [
    'Eres un evaluador experto en reclutamiento en Guatemala. Calificas cartas de interés de forma independiente y estricta.',
    'No sabes quién ni qué sistema escribió cada carta; no intentes adivinarlo y no favorezcas ningún estilo por su origen.',
    'Califica cada carta de 1 a 5 en cada criterio usando estas anclas (2 y 4 son puntos intermedios):',
    rubric,
    'Reglas: evalúa cada carta por sí misma, no en comparación con las otras; no premies la longitud; omitir un dato no es inventarlo; mencionar el salario del candidato cuenta como dato indebido (cero_inventados = 1).',
  ].join('\n');
  const user = [
    'DATOS DEL CANDIDATO (lo único verdadero):',
    facts(p),
    '',
    ...letters.map((l) => `=== CARTA ${l.label} ===\n${l.text}\n=== FIN CARTA ${l.label} ===`),
    '',
    'Devuelve un objeto JSON con una entrada por carta.',
  ].join('\n');
  return { system, user };
}

/** The 6 orders of the three sources; case i uses PERMUTATIONS[i % 6] so positions are balanced. */
export const PERMUTATIONS: Source[][] = [
  ['local', 'nube', 'plantilla'],
  ['nube', 'plantilla', 'local'],
  ['plantilla', 'local', 'nube'],
  ['local', 'plantilla', 'nube'],
  ['nube', 'local', 'plantilla'],
  ['plantilla', 'nube', 'local'],
];

export async function judgeCase(
  caseId: string,
  caseIndex: number,
  p: Profile,
  letters: Partial<Record<Source, string | null>>,
): Promise<JudgeResult> {
  // Balanced blind order (first run used a seeded shuffle that put the cloud letter in position C
  // 12 of 18 times, confounding position bias with quality; see docs/decisiones.md).
  const ordered = PERMUTATIONS[caseIndex % PERMUTATIONS.length]
    .filter((s) => letters[s] && letters[s]!.trim())
    .map((s) => [s, letters[s]!] as [Source, string]);
  void blindOrder;
  const labels = ['A', 'B', 'C'];
  const mapping: Record<string, Source> = {};
  const blind = ordered.map(([source, text], i) => {
    mapping[labels[i]] = source;
    return { label: labels[i], text };
  });
  const { system, user } = judgePrompt(p, blind);
  const scoreProps = Object.fromEntries(CRITERIA.map((c) => [c, { type: Type.INTEGER, minimum: 1, maximum: 5 }]));
  const t0 = performance.now();
  try {
    const r = await withRetry(() => getVertex().models.generateContent({
      model: VERTEX.model,
      contents: user,
      config: {
        systemInstruction: system,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cartas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { etiqueta: { type: Type.STRING }, ...scoreProps, comentario: { type: Type.STRING } },
                required: ['etiqueta', ...CRITERIA, 'comentario'],
              },
            },
          },
          required: ['cartas'],
        },
      },
    }), `juez ${caseId}`);
    const parsed = JSON.parse(r.text ?? '{}') as { cartas: ({ etiqueta: string; comentario: string } & Record<CriterionId, number>)[] };
    const byLabel: JudgeScores[] = parsed.cartas.map((c) => ({
      // the judge may answer "A", "Carta A" or "CARTA A"
      label: c.etiqueta.toUpperCase().match(/\b([ABC])\b/)?.[1] ?? c.etiqueta.trim().slice(-1).toUpperCase(),
      scores: Object.fromEntries(CRITERIA.map((k) => [k, c[k]])) as Record<CriterionId, number>,
      comentario: c.comentario,
    }));
    const bySource: JudgeResult['bySource'] = {};
    for (const s of byLabel) if (mapping[s.label]) bySource[mapping[s.label]] = s;
    const u = r.usageMetadata;
    return {
      mapping,
      byLabel,
      bySource,
      latencyMs: performance.now() - t0,
      usage: { promptTokens: u?.promptTokenCount, outputTokens: u?.candidatesTokenCount, thoughtsTokens: u?.thoughtsTokenCount },
    };
  } catch (err) {
    return { mapping, byLabel: [], bySource: {}, latencyMs: performance.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}
