/**
 * Orchestrates one "generate" click:
 *   local (always):  negotiation note + template letter
 *   cloud (optional): router → gate → cloud.generateLetter → restore name locally
 * The local model draft is requested separately by the UI (it may need a 2.3 GB download).
 */
import { cloud as defaultCloud, type CloudLetter } from './cloud';
import { buildNegotiationNote, type NegotiationNote } from './negotiation';
import { finalizeLetter } from './prompt';
import { buildCloudPayload, type RouteDecision } from './router';
import { buildTemplateLetter } from './template';
import type { Profile } from './types';

export type CloudStatus = 'sent' | 'blocked' | 'offline' | 'skipped' | 'error';

export interface SentRecord {
  at: string;
  destination: string;
  system: string;
  user: string;
  bytes: number;
}

export interface GenerateResult {
  note: NegotiationNote;
  template: string;
  route: RouteDecision;
  cloudStatus: CloudStatus;
  cloudLetter?: CloudLetter & { finalText: string };
  cloudError?: string;
  /** Exactly what left the device in this run (empty if nothing did). */
  sent: SentRecord[];
}

export interface GenerateOptions {
  online: boolean;
  /** false = user unchecked "usar la nube". */
  useCloud: boolean;
  client?: Pick<typeof defaultCloud, 'generateLetter'>;
}

export async function generateAll(profile: Profile, opts: GenerateOptions): Promise<GenerateResult> {
  const note = buildNegotiationNote(profile);
  const template = buildTemplateLetter(profile);
  const route = buildCloudPayload(profile);
  const base = { note, template, route, sent: [] as SentRecord[] };

  if (!opts.useCloud) return { ...base, cloudStatus: 'skipped' };
  if (route.blocked) return { ...base, cloudStatus: 'blocked' };
  if (!opts.online) return { ...base, cloudStatus: 'offline' };

  const client = opts.client ?? defaultCloud;
  const record: SentRecord = {
    at: new Date().toISOString(),
    destination: 'Firebase AI Logic → gemini-3.8-flash',
    system: route.prompt.system,
    user: route.prompt.user,
    bytes: new TextEncoder().encode(route.prompt.system + route.prompt.user).length,
  };
  try {
    base.sent.push(record);
    const letter = await client.generateLetter(route.prompt);
    return {
      ...base,
      cloudStatus: 'sent',
      cloudLetter: { ...letter, finalText: finalizeLetter(letter.text, profile.nombre) },
    };
  } catch (e) {
    return { ...base, cloudStatus: 'error', cloudError: e instanceof Error ? e.message : String(e) };
  }
}
