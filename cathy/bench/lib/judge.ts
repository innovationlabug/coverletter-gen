import { GoogleGenAI } from "@google/genai";
import type { Profile } from "../../src/lib/types";
import { computeFacts } from "../../src/lib/facts";
import { negotiationMessages, requirementsMessages } from "../../src/lib/prompts";
import { seededRandom } from "./stats";

/**
 * LLM-as-judge con Gemini (Vertex AI, ADC del usuario). Rúbrica 1–5 en cuatro criterios.
 * - Ciego: el juez ve "Respuesta A/B", nunca el nombre del modelo.
 * - Orden aleatorio (semilla = id de entrada + tarea) y registrado, para medir sesgo de posición.
 * - OJO: el juez recibe el perfil (ficticio) con salario para poder juzgar fidelidad. Esto
 *   solo es aceptable porque las entradas del benchmark son inventadas; la app jamás lo hace.
 */
export const CRITERIA = ["utilidad", "precision", "tono", "fidelidad"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Scores = Record<Criterion, number>;

export interface JudgeVerdict {
  inputId: string;
  task: "negotiation" | "requirements";
  order: string[]; // modelos en el orden en que se mostraron (A, B, …)
  scores: Record<string, Scores>;
  comment: string;
  judge: string;
  /** Cada orden juzgado por separado (para medir sesgo de posición). */
  passes?: JudgePass[];
}

const RUBRIC = `Eres un evaluador estricto. Calificas de 1 a 5 (enteros) cada respuesta, de forma independiente:
- utilidad: ¿le sirve a la persona para decidir o actuar?
- precision: ¿es correcta y concreta, sin errores ni vaguedades?
- tono: ¿apropiado (cálido y directo para la nota; neutro para la extracción)?
- fidelidad: ¿se apega a los DATOS/OFERTA sin inventar cifras, requisitos o hechos?
No premies la longitud por sí misma. No sabes qué sistema produjo cada respuesta.
Responde SOLO JSON.`;

/**
 * Contexto del juez = EXACTAMENTE el mensaje de usuario que recibió el modelo evaluado.
 * Error real de la primera corrida: el juez veía un resumen sin el rango publicado ni los años
 * de experiencia y castigaba como "inventadas" cifras que sí estaban en los DATOS del modelo.
 */
function context(task: "negotiation" | "requirements", p: Profile): string {
  const user = task === "negotiation" ? negotiationMessages(p, computeFacts(p))[1].content : requirementsMessages(p.jobOffer!)[1].content;
  const ask =
    task === "negotiation"
      ? "TAREA pedida al sistema: nota privada de negociación salarial en español, 90–170 palabras, en segunda persona, sin inventar cifras (solo las de DATOS o las de los logros), respetando la regla de cuándo mencionarlo."
      : "TAREA pedida al sistema: extraer requisitos de la oferta como JSON {must, nice, keywords}, en el idioma de la oferta, fieles al texto, sin salario ni beneficios.";
  return `ENTRADA EXACTA QUE RECIBIÓ EL SISTEMA (datos ficticios):\n${user}\n\n${ask}`;
}

export interface JudgePass {
  order: string[];
  scores: Record<string, Scores>;
  comment: string;
}

async function judgePass(task: "negotiation" | "requirements", profile: Profile, outputs: Record<string, string>, order: string[], model: string): Promise<JudgePass> {
  const labels = order.map((_, i) => String.fromCharCode(65 + i));
  const answers = order.map((m, i) => `### Respuesta ${labels[i]}\n${outputs[m]}`).join("\n\n");
  const schema = {
    type: "object",
    properties: {
      ...Object.fromEntries(
        labels.map((l) => [l, { type: "object", properties: Object.fromEntries(CRITERIA.map((c) => [c, { type: "integer", minimum: 1, maximum: 5 }])), required: [...CRITERIA] }]),
      ),
      comentario: { type: "string" },
    },
    required: [...labels, "comentario"],
  };
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || "ai-experiments-487722",
    location: process.env.GOOGLE_CLOUD_LOCATION || "global",
  });
  const request = () =>
    ai.models.generateContent({
      model,
      contents: `${context(task, profile)}\n\n${answers}`,
      config: { systemInstruction: RUBRIC, temperature: 0, responseMimeType: "application/json", responseJsonSchema: schema },
    });
  // Vertex devolvió 429 (RESOURCE_EXHAUSTED) en la primera corrida real: reintento con espera creciente.
  let res: Awaited<ReturnType<typeof request>> | undefined;
  for (const waitMs of [0, 5_000, 15_000, 30_000, 60_000]) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    try {
      res = await request();
      break;
    } catch (e) {
      if (!/429|RESOURCE_EXHAUSTED/.test(String(e instanceof Error ? e.message : e)) || waitMs === 60_000) throw e;
    }
  }
  if (!res) throw new Error("juez sin respuesta");
  const json = JSON.parse(res.text ?? "{}") as Record<string, Scores | string>;
  const scores: Record<string, Scores> = {};
  order.forEach((m, i) => (scores[m] = json[labels[i]] as Scores));
  return { order, scores, comment: String(json.comentario ?? "") };
}

function averagePasses(passes: JudgePass[]): Record<string, Scores> {
  const out: Record<string, Scores> = {};
  for (const m of passes[0].order) {
    out[m] = Object.fromEntries(CRITERIA.map((c) => [c, passes.reduce((a, p) => a + p.scores[m][c], 0) / passes.length])) as Scores;
  }
  return out;
}

/**
 * Juzga cada par en los DOS órdenes (A/B y B/A) y promedia. En la primera corrida real,
 * con un solo orden aleatorio, la respuesta mostrada primero ganó 15 de 21 veces.
 */
export async function judgeGemini(
  inputId: string,
  task: "negotiation" | "requirements",
  profile: Profile,
  outputs: Record<string, string>,
  model = process.env.JUDGE_MODEL || "gemini-3.8-flash",
): Promise<JudgeVerdict> {
  const rnd = seededRandom(`${inputId}:${task}`);
  const order = Object.keys(outputs).sort(() => rnd() - 0.5);
  const passes = [await judgePass(task, profile, outputs, order, model), await judgePass(task, profile, outputs, [...order].reverse(), model)];
  return { inputId, task, order, scores: averagePasses(passes), comment: passes[0].comment, judge: model, passes };
}

/** Juez simulado (modo --dry): puntajes deterministas a partir del texto. No significan nada. */
export function judgeMock(inputId: string, task: "negotiation" | "requirements", outputs: Record<string, string>): JudgeVerdict {
  const rnd = seededRandom(`${inputId}:${task}`);
  const order = Object.keys(outputs).sort(() => rnd() - 0.5);
  const pass = (o: string[], bonus: number): JudgePass => {
    const scores: Record<string, Scores> = {};
    o.forEach((m, i) => {
      const r = seededRandom(outputs[m]);
      // el juez simulado tiene un sesgo de posición deliberado (+1 al primero) para ejercitar el reporte
      scores[m] = Object.fromEntries(CRITERIA.map((c) => [c, Math.min(5, 2 + Math.floor(r() * 3) + (i === 0 ? bonus : 0))])) as Scores;
    });
    return { order: o, scores, comment: "juez simulado (--dry)" };
  };
  const passes = [pass(order, 1), pass([...order].reverse(), 1)];
  return { inputId, task, order, scores: averagePasses(passes), comment: "juez simulado (--dry)", judge: "mock", passes };
}
