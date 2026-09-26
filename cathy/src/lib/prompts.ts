import type { Profile } from "./types";
import type { NegotiationFacts } from "./facts";
import type { LetterPayload } from "./schemas";
import { formatMoney } from "./heuristics/currency";

/**
 * Constructores de prompts. Los usa el servidor (proxy de Ollama, ruta de la carta) y el
 * benchmark, para que el benchmark mida EXACTAMENTE lo que corre en la app.
 * Los prompts se arman en el servidor: el cliente manda datos, no instrucciones, así el
 * proxy no es un "LLM abierto" para cualquiera.
 */
export const PROMPT_VERSION = "2026-09-v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const NEGOTIATION_SYSTEM = `Eres Cathy, coach de negociación salarial para profesionales en Guatemala.
Escribes una NOTA PRIVADA de negociación salarial para la persona (no es una carta ni un documento financiero): nadie más la leerá.
Reglas:
1. Español de Guatemala, tuteo, directo y cálido.
2. Entre 90 y 170 palabras, 2 o 3 párrafos cortos. Sin títulos, sin viñetas, sin markdown.
3. NO inventes cifras. Si mencionas un número, cópialo exactamente de DATOS. No calcules porcentajes ni montos nuevos.
4. Respeta la regla de "cuándo mencionarlo" que viene en DATOS; puedes explicarla con tus palabras.
5. Usa los logros como argumento concreto. No repitas los DATOS en forma de lista.`;

function rangeLine(f: NegotiationFacts): string {
  const r = f.offerRange;
  if (!r) return "La oferta no publica rango salarial.";
  const lo = r.min != null ? formatMoney(r.min, r.currency) : "—";
  const hi = r.max != null ? formatMoney(r.max, r.currency) : "—";
  const per = r.period === "year" ? "anuales" : "mensuales";
  const pos = f.desiredVsRange === "within" ? "dentro" : f.desiredVsRange === "above" ? "por encima" : "por debajo";
  return `Rango publicado en la oferta: ${lo} a ${hi} ${per}. Tu expectativa queda ${pos} del rango.`;
}

export function negotiationMessages(profile: Profile, f: NegotiationFacts): ChatMessage[] {
  const sign = f.gapPct >= 0 ? "+" : "";
  const user = `DATOS (calculados por la app; son la fuente de verdad):
- Rol actual: ${profile.currentRole} en ${profile.currentEmployer}
- Salario actual: ${formatMoney(f.current.amount, f.current.currency)} mensuales
- Rol deseado: ${profile.desiredRole} en ${profile.targetCompany}
- Expectativa: ${formatMoney(f.desired.amount, f.desired.currency)} mensuales
- Brecha: ${sign}${f.gapPct} % (banda: ${f.bandLabel})
- ${rangeLine(f)}
- Cuándo mencionarlo: ${f.timing.moment} Porque: ${f.timing.why}
- Experiencia: ${f.yearsExperience} años (seniority estimado: ${f.seniority})
- Logros: ${profile.achievements || "(no indicó)"}

Escribe la nota sobre su expectativa SALARIAL para este cambio de trabajo: qué tan realista es, qué argumento usar y cuándo mencionarla al reclutador.`;
  return [
    { role: "system", content: NEGOTIATION_SYSTEM },
    { role: "user", content: user },
  ];
}

const REQUIREMENTS_SYSTEM = `Extraes requisitos de una oferta de empleo.
Responde SOLO con JSON válido: {"must": string[], "nice": string[], "keywords": string[]}.
- must: requisitos obligatorios (máx. 8).
- nice: deseables o "plus" (máx. 6).
- keywords: tecnologías, herramientas o habilidades concretas (máx. 10).
Frases cortas (máx. 12 palabras), en el idioma de la oferta, fieles al texto: no agregues nada que no esté escrito.
No incluyas salario, beneficios ni datos de contacto.`;

export function requirementsMessages(offer: string): ChatMessage[] {
  return [
    { role: "system", content: REQUIREMENTS_SYSTEM },
    { role: "user", content: `OFERTA:\n"""\n${offer.trim()}\n"""` },
  ];
}

export function letterPrompt(p: LetterPayload): { system: string; user: string } {
  const lang = p.language === "en" ? "inglés" : "español de Guatemala";
  // Decimos "carta de presentación (cover letter)" y no solo "carta de interés": un modelo de
  // 2B leyó "carta de interés" como carta financiera (interés compuesto, IVA). Ver docs/decisiones.md.
  const system = `Redactas cartas de presentación (cover letter) para acompañar un CV en una postulación de empleo.
Escribe en ${lang}. Entre 180 y 260 palabras. Tono profesional, cercano y concreto; sin clichés ("me apasiona", "soy proactivo").
Estructura: saludo, por qué esta empresa y este rol, 2 logros conectados con los requisitos, cierre con disponibilidad para conversar, firma con el nombre.
Nunca menciones salario, pretensión salarial ni el empleador actual.
Si ves marcadores entre corchetes como [MONTO] o [EMPLEADOR_ACTUAL], reescribe la frase sin ese dato; nunca copies los corchetes.
Los "Requisitos de la oferta" son lo que pide la empresa, no lo que la persona tiene: no afirmes habilidades, idiomas, herramientas ni certificaciones que no aparezcan en Logros.
Firma exactamente con el valor de Nombre, aunque venga entre corchetes.
Devuelve solo el texto de la carta.`;
  const reqs = p.requirements.length ? p.requirements.map((r) => `- ${r}`).join("\n") : "(sin oferta: usa el rol deseado)";
  const user = `Nombre: ${p.fullName}
Rol al que aplica: ${p.desiredRole}
Empresa: ${p.targetCompany}
Años de experiencia: ${p.yearsExperience} (nivel: ${p.seniority})
Logros:
${p.achievements || "(no indicó)"}
Requisitos de la oferta:
${reqs}`;
  return { system, user };
}
