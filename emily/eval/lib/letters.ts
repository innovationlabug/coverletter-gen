/**
 * Letter generators for the evaluation. Each one reuses the app's own code:
 *  - template: src/lib/template.ts (deterministic baseline);
 *  - local:    src/lib/local-model.ts (same model id, dtype, chat template and prompt builder
 *              as the browser worker), running in Node on WebGPU (Dawn) or CPU;
 *  - cloud:    gemini-3.8-flash with the SAME prompt the router builds for Firebase AI Logic,
 *              but called through @google/genai on Vertex AI (see eval/CRITERIOS.md, "Por qué Vertex").
 * Generated letters are cached in .cache/eval-letters so re-running the judge/report does not
 * regenerate them (use --fresh to ignore the cache).
 */
import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '@huggingface/transformers';
import { createLocalGenerator, type LocalDevice, type LocalGenerator } from '../../src/lib/local-model';
import { buildLetterPrompt, finalizeLetter, LETTER_GENERATION, localLetterInput, type LetterPrompt } from '../../src/lib/prompt';
import { buildCloudPayload } from '../../src/lib/router';
import { buildTemplateLetter } from '../../src/lib/template';
import type { Profile } from '../../src/lib/types';

/** Vertex AI project for the eval's cloud letters and judge. Override with VERTEX_PROJECT=<id>. */
export const VERTEX = {
  project: process.env.VERTEX_PROJECT || 'ai-experiments-487722',
  location: 'global',
  model: 'gemini-3.8-flash',
} as const;
const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = path.join(ROOT, '.cache/eval-letters');

export type Source = 'local' | 'nube' | 'plantilla';

export interface GeneratedLetter {
  source: Source;
  text: string | null;
  /** Why there is no text (e.g. the router blocked the cloud request). */
  skipped?: string;
  error?: string;
  latencyMs?: number;
  device?: string;
  usage?: { promptTokens?: number; outputTokens?: number; thoughtsTokens?: number };
  cached?: boolean;
}

function hash(p: LetterPrompt): string {
  return createHash('sha256').update(p.system + '\n' + p.user).digest('hex').slice(0, 12);
}

function readCache(source: Source, id: string, h: string): GeneratedLetter | null {
  const f = path.join(CACHE, source, `${id}-${h}.json`);
  if (!existsSync(f)) return null;
  return { ...(JSON.parse(readFileSync(f, 'utf8')) as GeneratedLetter), cached: true };
}

function writeCache(source: Source, id: string, h: string, l: GeneratedLetter) {
  mkdirSync(path.join(CACHE, source), { recursive: true });
  writeFileSync(path.join(CACHE, source, `${id}-${h}.json`), JSON.stringify(l, null, 2));
}

export function templateLetter(p: Profile): GeneratedLetter {
  const t0 = performance.now();
  const text = buildTemplateLetter(p);
  return { source: 'plantilla', text, latencyMs: performance.now() - t0 };
}

let localGen: Promise<LocalGenerator> | null = null;

export function getLocalGenerator(device: LocalDevice): Promise<LocalGenerator> {
  env.cacheDir = path.join(ROOT, '.cache/transformers');
  localGen ??= createLocalGenerator({ device }).catch(async (err) => {
    if (device === 'cpu') throw err;
    console.warn(`[local] ${device} failed (${err instanceof Error ? err.message : err}); falling back to cpu`);
    return createLocalGenerator({ device: 'cpu' });
  });
  return localGen;
}

export async function localLetter(id: string, p: Profile, device: LocalDevice, fresh: boolean): Promise<GeneratedLetter> {
  const prompt = buildLetterPrompt(localLetterInput(p));
  const h = hash(prompt);
  if (!fresh) {
    const c = readCache('local', id, h);
    if (c) return c;
  }
  try {
    const gen = await getLocalGenerator(device);
    const t0 = performance.now();
    const raw = await gen.generate(prompt);
    const l: GeneratedLetter = { source: 'local', text: finalizeLetter(raw, p.nombre), latencyMs: performance.now() - t0, device: gen.device };
    writeCache('local', id, h, l);
    return l;
  } catch (err) {
    return { source: 'local', text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Retries 429 / 5xx from Vertex with exponential backoff (shared quota with other jobs). */
export async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 7): Promise<T> {
  let delay = 5_000;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retriable = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed|ECONNRESET/i.test(msg);
      if (!retriable || i >= attempts) throw err;
      console.warn(`  [${label}] intento ${i} falló (${msg.slice(0, 80)}…); reintento en ${delay / 1000} s`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 90_000);
    }
  }
}

let vertex: GoogleGenAI | null = null;
export function getVertex(): GoogleGenAI {
  vertex ??= new GoogleGenAI({ vertexai: true, project: VERTEX.project, location: VERTEX.location });
  return vertex;
}

export async function cloudLetter(id: string, p: Profile, fresh: boolean): Promise<GeneratedLetter> {
  const route = buildCloudPayload(p);
  if (route.blocked) return { source: 'nube', text: null, skipped: 'bloqueado por el control final del router' };
  const h = hash(route.prompt);
  if (!fresh) {
    const c = readCache('nube', id, h);
    if (c) return c;
  }
  try {
    const t0 = performance.now();
    const r = await withRetry(
      () =>
        getVertex().models.generateContent({
          model: VERTEX.model,
          contents: route.prompt.user,
          config: {
            systemInstruction: route.prompt.system,
            temperature: LETTER_GENERATION.temperature,
            topP: LETTER_GENERATION.topP,
            maxOutputTokens: 4096,
          },
        }),
      `nube ${id}`,
    );
    const u = r.usageMetadata;
    const l: GeneratedLetter = {
      source: 'nube',
      text: finalizeLetter(r.text ?? '', p.nombre),
      latencyMs: performance.now() - t0,
      usage: { promptTokens: u?.promptTokenCount, outputTokens: u?.candidatesTokenCount, thoughtsTokens: u?.thoughtsTokenCount },
    };
    writeCache('nube', id, h, l);
    return l;
  } catch (err) {
    return { source: 'nube', text: null, error: err instanceof Error ? err.message : String(err) };
  }
}
