/**
 * Measures how long ONE full cover letter takes with the local model on CPU vs WebGPU in Node
 * (same prompt builder as the app, example profile). Used for the latency notes in
 * docs/decisiones.md. Usage: npx tsx scripts/cpu-latency.ts [cpu|webgpu]
 */
import { env } from '@huggingface/transformers';
import path from 'node:path';
import { createLocalGenerator } from '../src/lib/local-model';
import { buildLetterPrompt, finalizeLetter, localLetterInput } from '../src/lib/prompt';
import { wordCount } from '../src/lib/text';
import { EXAMPLE_PROFILE } from '../src/ui/example';

env.cacheDir = path.resolve(import.meta.dirname, '../.cache/transformers');
const device = (process.argv[2] ?? 'cpu') as 'cpu' | 'webgpu';
const t0 = performance.now();
const gen = await createLocalGenerator({ device });
const t1 = performance.now();
let chunks = 0;
const raw = await gen.generate(buildLetterPrompt(localLetterInput(EXAMPLE_PROFILE)), () => chunks++);
const t2 = performance.now();
const text = finalizeLetter(raw, EXAMPLE_PROFILE.nombre);
console.log(JSON.stringify({ device, loadS: +((t1 - t0) / 1000).toFixed(1), generateS: +((t2 - t1) / 1000).toFixed(1), words: wordCount(text), streamedChunks: chunks, wordsPerS: +(wordCount(text) / ((t2 - t1) / 1000)).toFixed(2) }));
