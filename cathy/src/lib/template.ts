import type { LetterPayload } from "./schemas";
import { humanizePlaceholders } from "./heuristics/redactor";

/**
 * Carta determinista (sin modelo). Se usa offline o si Gemini falla.
 * Recibe el MISMO payload redactado que recibiría Gemini: offline no es excusa para que el
 * salario termine en una carta que se le manda a un reclutador.
 */
function sentences(text: string, max: number): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
    .filter((s) => s.length > 8)
    .slice(0, max);
}

function list(items: string[], lang: "es" | "en"): string {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")} ${lang === "en" ? "and" : "y"} ${last}`;
}

export function buildTemplateLetter(p: LetterPayload): string {
  const lang = p.language;
  const wins = sentences(humanizePlaceholders(p.achievements, lang), 2).map((s) => s.replace(/[.!?]$/, ""));
  const reqs = p.requirements.slice(0, 3).map((r) => r.replace(/[.;]$/, "").toLowerCase());
  const years = p.yearsExperience === 1 ? (lang === "en" ? "1 year" : "1 año") : `${p.yearsExperience} ${lang === "en" ? "years" : "años"}`;

  if (lang === "en") {
    return [
      `Dear ${p.targetCompany} hiring team,`,
      `I am writing to express my interest in the ${p.desiredRole} position. With ${years} of experience, I would like to bring my work to ${p.targetCompany}.`,
      wins.length ? `Some results I am proud of: ${list(wins, "en")}.` : "",
      reqs.length ? `Your posting mentions ${list(reqs, "en")}; that is exactly the kind of work I have been doing and want to keep growing in.` : "",
      `I would welcome the chance to talk about how I can contribute to your team. Thank you for your time.`,
      `Best regards,\n${p.fullName}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    `Estimado equipo de ${p.targetCompany}:`,
    `Les escribo para expresar mi interés en la posición de ${p.desiredRole}. Tengo ${years} de experiencia y me gustaría aportar ese recorrido a ${p.targetCompany}.`,
    wins.length ? `Algunos resultados de los que me siento orgulloso(a): ${list(wins, "es")}.` : "",
    reqs.length ? `Su oferta menciona ${list(reqs, "es")}; es justo el tipo de trabajo que he venido haciendo y en el que quiero seguir creciendo.` : "",
    `Me encantaría conversar sobre cómo puedo contribuir a su equipo. Quedo atento(a) a su respuesta.`,
    `Saludos cordiales,\n${p.fullName}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
