/**
 * Probe: can transformers.js (Node, CPU) load and run a candidate local model?
 * Usage: npx tsx scripts/probe-local-model.ts [modelId] [dtype]
 * Records load time, generation latency and a short sample. Used to decide the
 * local model (see docs/decisiones.md).
 */
import { Gemma4Processor, env, pipeline } from '@huggingface/transformers';
import path from 'node:path';

env.cacheDir = path.resolve(import.meta.dirname, '../.cache/transformers');

const modelId = process.argv[2] ?? 'onnx-community/gemma-4-E2B-it-qat-mobile-ONNX';
const dtype = (process.argv[3] ?? 'q2f16') as any;

const t0 = performance.now();
let lastPct = -10;
const gen = await pipeline('text-generation', modelId, {
  dtype,
  device: (process.env.DEVICE ?? 'cpu') as any,
  progress_callback: (p: any) => {
    if (p.status === 'progress_total') {
      const pct = Math.floor(p.progress);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        console.log(`download ${pct}% (${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB)`);
      }
    }
  },
});
const t1 = performance.now();
console.log(`loaded in ${((t1 - t0) / 1000).toFixed(1)} s`);

const messages = [
  { role: 'system', content: 'Eres un asistente que escribe en español de Guatemala.' },
  { role: 'user', content: 'Escribe dos oraciones presentando a una desarrolladora que busca empleo.' },
];
// The ONNX repo ships the template as chat_template.jinja (not inside tokenizer_config.json),
// which the text-generation pipeline's tokenizer does not read. The Processor does.
const processor: any = await Gemma4Processor.from_pretrained(modelId);
const chat_template: string | undefined = processor.chat_template ?? undefined;
console.log('chat_template from processor:', chat_template ? `${chat_template.length} chars` : 'none');
const out: any = await gen(messages, { max_new_tokens: 120, do_sample: false, chat_template } as any);
const t2 = performance.now();
const text = out[0].generated_text.at(-1).content;
console.log(`generated in ${((t2 - t1) / 1000).toFixed(1)} s`);
console.log('---\n' + text);
