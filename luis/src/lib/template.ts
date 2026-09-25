/**
 * Deterministic fallback letter — used offline or when Gemini fails.
 * Needs no current salary nor current employer; sentences from the free text
 * that contain anything sensitive are dropped (not "[monto]"-ed) so the letter
 * is ready to send.
 */
import { contextFromProfile, dropSensitiveSentences } from "./redact";
import type { Profile } from "./types";

export interface TemplateLetter {
  text: string;
  source: "template";
}

function yearsPhrase(years: number): string {
  const y = Math.max(0, Math.round(years));
  if (y === 0) return "menos de un año de experiencia";
  if (y === 1) return "un año de experiencia";
  return `${y} años de experiencia`;
}

function firstSentences(text: string, max: number): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, max).join(" ");
}

function ensurePeriod(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function buildTemplateLetter(profile: Profile, date: Date = new Date()): TemplateLetter {
  const ctx = contextFromProfile(profile);
  // The user's own name is fine in their letter; salaries/employer/IDs are not.
  const safeAchievements = dropSensitiveSentences(profile.achievements, {
    ...ctx,
    names: [],
  });
  const company = profile.targetCompany.trim() || "su organización";
  const role = profile.desiredRole.trim() || "el puesto";
  const currentRole = profile.currentRole.trim();
  const city = profile.location.split(",")[0]?.trim() || "Guatemala";
  const dateText = new Intl.DateTimeFormat("es-GT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  const paragraphs: string[] = [];
  paragraphs.push(`${city}, ${dateText}`);
  paragraphs.push(`Estimado equipo de selección de ${company}:`);
  paragraphs.push(
    `Me dirijo a ustedes para expresar mi interés en el puesto de ${role}. ` +
      `Cuento con ${yearsPhrase(profile.yearsExperience)}${
        currentRole ? ` y actualmente me desempeño como ${currentRole}` : ""
      }, lo que me ha permitido desarrollar las capacidades que este rol requiere.`,
  );
  if (safeAchievements) {
    paragraphs.push(
      `Entre los resultados que puedo aportar destaco lo siguiente: ${ensurePeriod(
        lowerFirst(firstSentences(safeAchievements, 3)),
      )}`,
    );
  }
  paragraphs.push(
    `Me entusiasma la posibilidad de contribuir al equipo de ${company} y de seguir creciendo profesionalmente en un entorno exigente. ` +
      "Adjunto mi currículum y quedo a su disposición para conversar sobre cómo puedo aportar desde el primer día.",
  );
  paragraphs.push("Atentamente,");
  paragraphs.push(profile.name.trim() || "[Tu nombre]");

  return { text: paragraphs.join("\n\n"), source: "template" };
}
