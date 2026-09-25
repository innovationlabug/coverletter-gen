/// <reference lib="webworker" />
/**
 * Web Worker that owns the local model. Keeps the 2.3 GB model and the token loop off the
 * main thread. Protocol: see ./protocol.ts. The weights are cached by transformers.js in
 * Cache Storage ("transformers-cache"), so after the first download it works offline.
 */
import { createLocalGenerator, type LocalGenerator } from '../lib/local-model';
import type { WorkerEvent, WorkerRequest } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let generatorPromise: Promise<LocalGenerator> | null = null;

const post = (e: WorkerEvent) => self.postMessage(e);

async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter())) return 'webgpu';
  } catch {
    /* fall through */
  }
  return 'wasm';
}

function load(): Promise<LocalGenerator> {
  generatorPromise ??= (async () => {
    const device = await pickDevice();
    post({ type: 'device', device });
    const t0 = performance.now();
    const gen = await createLocalGenerator({
      device,
      onProgress: (p) => post({ type: 'progress', ...p }),
    });
    post({ type: 'ready', device, loadMs: performance.now() - t0 });
    return gen;
  })().catch((err) => {
    generatorPromise = null;
    throw err;
  });
  return generatorPromise;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      await load();
    } else if (msg.type === 'generate') {
      const gen = await load();
      const t0 = performance.now();
      const text = await gen.generate(msg.prompt, (chunk) => post({ type: 'token', id: msg.id, text: chunk }), {
        maxNewTokens: msg.maxNewTokens,
      });
      post({ type: 'done', id: msg.id, text, ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
