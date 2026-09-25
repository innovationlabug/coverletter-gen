/**
 * ONE prompt builder for every letter generator: the in-browser model (worker), the cloud
 * model (Firebase AI Logic) and the evaluation harness (eval/). Only the INPUT differs:
 *  - local: the full profile (it never leaves the device), minus salaries;
 *  - cloud: the redacted payload produced by router.buildCloudPayload().
 */
import { NAME_PLACEHOLDER } from './redact';
import type { Profile } from './types';

export interface LetterInput {
  /** Name used to sign. For the cloud it is NAME_PLACEHOLDER and gets restored locally. */
  firma: string;
  puestoActual: string;
  /** Only present for the local model. */
  empleadorActual?: string;
  aniosExperiencia: number;
  puestoDeseado: string;
  empresaDestino: string;
  logros: string;
  oferta?: string;
}

export interface LetterPrompt {
  system: string;
  user: string;
}

/** Generation settings shared by local and cloud generators. */
export const LETTER_GENERATION = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 900,
} as const;

export const LETTER_SYSTEM = [
  'Eres un redactor profesional de cartas de interés (cover letters) para el mercado laboral de Guatemala.',
  'Escribe en español correcto y profesional, tratando de "usted" al lector.',
  'Reglas obligatorias:',
  '1. La carta debe tener entre 250 y 400 palabras.',
  '2. Usa SOLO los datos proporcionados. No inventes cifras, porcentajes, empresas, títulos, certificaciones, fechas ni logros.',
  '3. No menciones salarios, pretensiones salariales, teléfonos, correos, DPI, NIT ni direcciones.',
  '4. Si ves etiquetas entre corchetes como [SALARIO], [PERSONA], [EMPLEADOR_ACTUAL], [TELÉFONO] o [DIRECCIÓN], NO las copies: reformula la idea sin ese dato.',
  '5. Estructura: saludo dirigido al equipo de la empresa destino; 3 o 4 párrafos que conecten la experiencia y los logros con el puesto (y con la oferta, si la hay); un cierre que invite explícitamente a una entrevista o conversación; despedida y firma.',
  '6. Firma exactamente con el nombre indicado en "Nombre para la firma", sin cambiarlo.',
  '7. Tono profesional y cálido, sin exageraciones, sin emojis y sin formato markdown.',
  '8. Devuelve solo el texto de la carta, sin comentarios antes ni después.',
].join('\n');

export function buildLetterPrompt(input: LetterInput): LetterPrompt {
  const lines = [
    'Escribe la carta de interés con estos datos del candidato.',
    '',
    `Nombre para la firma: ${input.firma}`,
    `Puesto actual: ${input.puestoActual || 'No indicado'}`,
    input.empleadorActual ? `Empleador actual: ${input.empleadorActual}` : 'Empleador actual: no se menciona en la carta',
    `Años de experiencia: ${input.aniosExperiencia}`,
    `Puesto al que aplica: ${input.puestoDeseado}`,
    `Empresa destino: ${input.empresaDestino}`,
    '',
    'Logros y experiencia (texto del candidato):',
    '<<<',
    input.logros.trim() || 'No indicó logros.',
    '>>>',
    '',
  ];
  if (input.oferta && input.oferta.trim()) {
    lines.push('Oferta de trabajo publicada (úsala para ajustar la carta a lo que piden):', '<<<', input.oferta.trim(), '>>>');
  } else {
    lines.push('No se proporcionó oferta: enfoca la carta en el puesto y la empresa destino.');
  }
  return { system: LETTER_SYSTEM, user: lines.join('\n') };
}

/** Local generator input: the whole profile except salaries (a letter must never state them). */
export function localLetterInput(p: Profile): LetterInput {
  return {
    firma: p.nombre,
    puestoActual: p.puestoActual,
    empleadorActual: p.empleadorActual || undefined,
    aniosExperiencia: p.aniosExperiencia,
    puestoDeseado: p.puestoDeseado,
    empresaDestino: p.empresaDestino,
    logros: p.logros,
    oferta: p.oferta,
  };
}

/**
 * Post-processing applied to any generated letter, locally:
 * strips thinking blocks / markdown and restores the user's name in place of the placeholder.
 */
export function finalizeLetter(raw: string, nombre: string): string {
  let t = raw;
  // Gemma 4 thinking channel, if the model ever emits it.
  t = t.replace(/<\|channel\>thought[\s\S]*?<channel\|>/g, '');
  t = t.replace(/<\/?(?:think|thinking)>[\s\S]*?<\/(?:think|thinking)>/g, '');
  t = t.replace(/```[a-z]*\n?|```/g, '');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');
  t = t.split(NAME_PLACEHOLDER).join(nombre || '');
  t = t.replace(/\{\{\s*NOMBRE\s*\}\}/gi, nombre || '');
  return t.trim();
}
