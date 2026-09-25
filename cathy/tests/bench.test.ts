import { describe, expect, it } from "vitest";
import { negotiationQuality, requirementsQuality } from "../bench/lib/quality";
import { startMockOllama } from "../bench/mock-ollama";
import { ollamaChat, ollamaPs, ollamaUnload } from "@/lib/ollama-client";
import { buildRequirementsRequest } from "@/lib/tasks";
import { seededRandom } from "../bench/lib/stats";
import { loadInputs } from "./fixtures/profiles";

const p = loadInputs()[0].profile;

describe("benchmark: chequeos deterministas de calidad", () => {
  it("nota buena vs nota con cifra inventada y fuera de tema", () => {
    const good =
      "Tu expectativa salarial es razonable: pasar de Q15,000 a Q17,500 es un salto de 16.7 % y cae dentro del rango que publica la oferta. " +
      "Apóyate en la automatización de 40 reportes semanales y en la migración del data mart: son exactamente lo que piden. " +
      "No la pongas en la carta; en la primera llamada con RR. HH. puedes decirla con tranquilidad, porque el rango ya está sobre la mesa. " +
      "Si te preguntan por qué, habla de impacto y de horas ahorradas, no de tus gastos. Llega con los números claros y deja que la conversación fluya.";
    expect(negotiationQuality(good, p)).toMatchObject({ spanish: true, lengthOk: true, numbersConsistent: true, onTopic: true, score: 1 });
    const bad = "Una carta de interés sirve para calcular el interés compuesto y el IVA. Pide un 40% más.";
    const q = negotiationQuality(bad, p);
    expect(q.inventedNumbers).toBe(1);
    expect(q.onTopic).toBe(false);
    expect(q.score).toBeLessThanOrEqual(0.5);
    expect(negotiationQuality("Mi expectativa salarial es razonable y mis logros lo respaldan en la entrevista.", p).secondPerson).toBe(false);
  });

  it("requisitos: grounding detecta requisitos inventados", () => {
    const grounded = requirementsQuality('{"must":["SQL avanzado y Power BI","4 años de experiencia en inteligencia de negocios"],"nice":["Inglés intermedio"],"keywords":["SQL"]}', p.jobOffer!);
    expect(grounded.grounding).toBe(1);
    const invented = requirementsQuality('{"must":["Certificación Kubernetes","Maestría en finanzas"],"nice":[],"keywords":[]}', p.jobOffer!);
    expect(invented.grounding).toBe(0);
    expect(requirementsQuality("no es json", p.jobOffer!).jsonValid).toBe(false);
  });

  it("orden del juez reproducible", () => {
    expect(seededRandom("a")()).toBe(seededRandom("a")());
  });
});

describe("benchmark: Ollama simulado", () => {
  it("stream, métricas, /api/ps y descarga", async () => {
    const mock = await startMockOllama();
    try {
      const r = await ollamaChat(mock.url, buildRequirementsRequest("gemma4:e2b-it-qat", p.jobOffer!));
      expect(r.stats.tokensPerSecond).toBeCloseTo(19.7, 0);
      expect(r.stats.loadMs).toBeGreaterThan(100); // primera llamada = frío
      expect((await ollamaPs(mock.url))[0]).toMatchObject({ name: "gemma4:e2b-it-qat", size_vram: 0 });
      await ollamaUnload(mock.url, "gemma4:e2b-it-qat");
      expect(await ollamaPs(mock.url)).toEqual([]);
    } finally {
      await mock.close();
    }
  });
});
