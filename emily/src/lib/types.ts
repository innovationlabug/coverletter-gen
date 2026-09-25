/** Currencies supported by the app. See money.ts for the documented exchange constant. */
export type Currency = 'GTQ' | 'USD';

/**
 * Everything the user tells the app "frankly". Lives only in the browser.
 * Fields marked SENSITIVE never reach the cloud (enforced by router.ts + tests).
 */
export interface Profile {
  /** Candidate's name. Replaced by a placeholder before going to the cloud and restored locally. */
  nombre: string;
  puestoActual: string;
  /** SENSITIVE: current employer. */
  empleadorActual: string;
  /** SENSITIVE: current monthly salary. Never leaves the device. */
  salarioActual: number;
  monedaActual: Currency;
  puestoDeseado: string;
  empresaDestino: string;
  /** Desired monthly salary. Only used by the local negotiation note. */
  salarioDeseado: number;
  monedaDeseada: Currency;
  aniosExperiencia: number;
  /** Free text; may contain sensitive data (redacted before the cloud). */
  logros: string;
  /** Optional pasted job offer; may contain sensitive data (redacted before the cloud). */
  oferta?: string;
}

export type SensitiveType =
  | 'salary'
  | 'employer'
  | 'person_name'
  | 'phone'
  | 'email'
  | 'dpi'
  | 'address'
  | 'nit';

export const SENSITIVE_TYPES: SensitiveType[] = [
  'salary',
  'employer',
  'person_name',
  'phone',
  'email',
  'dpi',
  'address',
  'nit',
];

export interface Finding {
  type: SensitiveType;
  /** Exact text that was matched in the input. */
  match: string;
  index: number;
  /** Which rule found it (for the "qué salió a la nube" panel and the eval). */
  rule: string;
}
