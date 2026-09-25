/**
 * Deterministic template letter. Works offline, with no model at all, and is the baseline
 * against which the local and cloud letters are evaluated (eval/).
 *
 * Privacy hygiene: achievement items or offer requirements that contain anything sensitive
 * (money, phones, emails, IDs, addresses, third-party names, the current employer) are dropped,
 * so the template never copies them into a letter meant for a third party.
 */
import { findSensitive } from './redact';
import { offerRequirements, splitItems, wordCount } from './text';
import type { Profile } from './types';

export const TEMPLATE_MIN_WORDS = 250;
export const TEMPLATE_MAX_WORDS = 400;

function isClean(item: string, p: Profile): boolean {
  return findSensitive(item, { employer: p.empleadorActual }).length === 0;
}

function trimWords(s: string, max: number): string {
  const words = s.split(/\s+/);
  return words.length <= max ? s : words.slice(0, max).join(' ') + '…';
}

/**
 * Lowercase the first letter only when the first word looks like an ordinary Spanish word
 * ("Automaticé", "Experiencia", "Orquestación"). Proper nouns and tech names keep their case
 * ("Python", "Airflow", "BigQuery", "Java"). Found by the evaluation: the judge flagged
 * "python y SQL avanzado".
 */
function lowerFirst(s: string): string {
  const first = s.split(/\s+/)[0] ?? '';
  const ordinary =
    /^[\p{Lu}][\p{Ll}]+$/u.test(first) &&
    (/(é|ó|í|aba|aron|ía|ción|ciones|miento|mientos|ncia|ncias|dad|dades|je|mos|ar|er|ir|ado|ada|ados|adas|ido|ida|idos|idas)$/.test(first.toLowerCase()) ||
      /^(hice|hizo|tuve|estuve|pude|puse|fui|di|vi|conduje|traduje|produje|manejo|coordino|dirijo|atiendo|llevo|tengo|soy|cubro|organicé|apoyé|entrené)$/.test(first.toLowerCase()));
  return ordinary ? s[0].toLowerCase() + s.slice(1) : s;
}

function stripEndPunct(s: string): string {
  return s.replace(/[.;:,\s]+$/, '');
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  const last = items[items.length - 1];
  // "y" becomes "e" before an /i/ sound ("e implementé"), not before "hie-" ("y hierro")
  const conj = /^(i|hi)(?!e)/i.test(last) ? 'e' : 'y';
  return `${items.slice(0, -1).join('; ')}; ${conj} ${last}`;
}

function experiencePhrase(years: number): string {
  if (!years || years <= 0) return 'me encuentro en el inicio de mi carrera profesional';
  if (years === 1) return 'cuento con un año de experiencia';
  return `cuento con ${years} años de experiencia`;
}

export function buildTemplateLetter(p: Profile, maxItems = 3): string {
  const empresa = p.empresaDestino.trim() || 'su empresa';
  const puesto = p.puestoDeseado.trim() || 'el puesto';
  const actual = isClean(p.puestoActual, p) ? p.puestoActual.trim() : '';

  const logros = splitItems(p.logros)
    .filter((i) => isClean(i, p))
    .slice(0, maxItems)
    .map((i) => lowerFirst(stripEndPunct(trimWords(i, 28))));
  const reqs = offerRequirements(p.oferta)
    .filter((i) => isClean(i, p))
    .map((i) => lowerFirst(stripEndPunct(trimWords(i, 14))));

  const paragraphs: string[] = [];
  paragraphs.push(`Estimado equipo de ${empresa}:`);
  paragraphs.push(
    `Me dirijo a ustedes para expresar mi interés en el puesto de ${puesto}. ` +
      (actual ? `Actualmente me desempeño como ${actual} y ${experiencePhrase(p.aniosExperiencia)}. ` : `${experiencePhrase(p.aniosExperiencia).replace(/^./, (c) => c.toUpperCase())}. `) +
      `Durante este tiempo he desarrollado una forma de trabajar ordenada, orientada a resultados y con atención al detalle, que me gustaría poner al servicio de ${empresa}.`,
  );
  if (logros.length) {
    paragraphs.push(
      `Entre los logros que mejor describen mi trabajo destaco los siguientes: ${joinList(logros)}. ` +
        'Estas experiencias me enseñaron a priorizar, a coordinarme con personas de distintas áreas y a sostener la calidad aun con plazos exigentes.',
    );
  } else {
    paragraphs.push(
      'A lo largo de mi experiencia he asumido responsabilidades crecientes, he aprendido a priorizar y a coordinarme con personas de distintas áreas, y he mantenido la calidad de mi trabajo aun con plazos exigentes.',
    );
  }
  if (reqs.length) {
    paragraphs.push(
      `Al revisar la oferta noté que buscan a alguien con ${joinList(reqs)}. ` +
        `Considero que mi trayectoria se alinea con estas necesidades y que puedo aportar desde el primer día como ${puesto}.`,
    );
  } else {
    paragraphs.push(
      `Me motiva especialmente la posibilidad de aportar a ${empresa} desde el rol de ${puesto}, ` +
        'donde puedo combinar lo que ya sé hacer bien con las ganas de seguir aprendiendo.',
    );
  }
  const padding = [
    'Me caracterizo por comunicarme con claridad, documentar lo que hago y pedir retroalimentación de forma constante. Disfruto trabajar en equipo y creo que los mejores resultados aparecen cuando se comparten el conocimiento y los objetivos.',
    'También valoro los entornos donde se aprende de forma continua; por eso dedico tiempo a actualizarme y a compartir con mis compañeros lo que voy aprendiendo.',
    'Busco un lugar donde pueda asumir retos nuevos, recibir retroalimentación honesta y crecer junto a un equipo comprometido con hacer bien las cosas. Tengo la convicción de que puedo sumar tanto por lo que ya sé hacer como por mi disposición a seguir aprendiendo.',
  ];
  const closing = [
    `Me encantaría conversar con ustedes en una entrevista para ampliar cómo puedo contribuir a los objetivos de ${empresa}. Quedo a su disposición y agradezco de antemano su tiempo y consideración.`,
    'Atentamente,',
    p.nombre.trim() || '',
  ];

  let letter = [...paragraphs, ...closing].join('\n\n');
  for (const extra of padding) {
    if (wordCount(letter) >= TEMPLATE_MIN_WORDS) break;
    paragraphs.push(extra);
    letter = [...paragraphs, ...closing].join('\n\n');
  }
  if (wordCount(letter) > TEMPLATE_MAX_WORDS && maxItems > 1) return buildTemplateLetter(p, maxItems - 1);
  return letter.trim();
}
