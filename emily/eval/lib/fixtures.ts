import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { canonical } from '../../src/lib/redact';
import type { Profile, SensitiveType } from '../../src/lib/types';

export interface Canary {
  type: SensitiveType;
  value: string;
  dificultad: 'fácil' | 'media' | 'difícil';
  nota: string;
}

export interface Fixture {
  id: string;
  descripcion: string;
  profile: Profile;
  canaries: Canary[];
  /** Non-sensitive strings that must survive redaction (false-positive probes). */
  allowed: string[];
}

export const FIXTURES_DIR = path.resolve(import.meta.dirname, '../fixtures');

/** Text of the fields that are candidates to reach the cloud (router allowlist). */
export function cloudBoundText(p: Profile): string {
  return [p.puestoActual, p.puestoDeseado, p.empresaDestino, p.logros, p.oferta ?? ''].join('\n');
}

export function loadFixtures(only?: string[]): Fixture[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort();
  const all = files.map((f) => JSON.parse(readFileSync(path.join(FIXTURES_DIR, f), 'utf8')) as Fixture);
  const errors: string[] = [];
  for (const fx of all) {
    const src = canonical(cloudBoundText(fx.profile));
    for (const c of fx.canaries) {
      if (!src.includes(canonical(c.value))) errors.push(`${fx.id}: canary "${c.value}" is not in the cloud-bound fields`);
    }
    for (const a of fx.allowed) {
      if (!src.includes(canonical(a))) errors.push(`${fx.id}: allowed "${a}" is not in the cloud-bound fields`);
    }
  }
  if (errors.length) throw new Error(`Invalid fixtures:\n${errors.join('\n')}`);
  return only?.length ? all.filter((f) => only.some((o) => f.id.startsWith(o))) : all;
}
