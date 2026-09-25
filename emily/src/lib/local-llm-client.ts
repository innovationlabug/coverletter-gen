/**
 * Page-side API for the local model. Usage:
 *
 *   const llm = createLocalLlm({ onEvent: (e) => console.log(e) });
 *   await llm.load();                                  // downloads ~2.3 GB the first time
 *   const text = await llm.generate(buildLetterPrompt(localLetterInput(profile)), (t) => show(t));
 *
 * In the Playwright build (VITE_TEST_MODE=1) a deterministic fake replaces the worker so the
 * e2e test does not download the model.
 */
import type { LetterPrompt } from './prompt';
import { LOCAL_MODEL, modelFileUrl, TRANSFORMERS_CACHE_NAME } from './local-model-meta';
import type { WorkerEvent, WorkerRequest } from '../worker/protocol';

export interface LocalLlm {
  load(): Promise<void>;
  generate(prompt: LetterPrompt, onText?: (chunk: string) => void): Promise<string>;
}

export async function isModelCached(): Promise<boolean> {
  try {
    if (!('caches' in self)) return false;
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    return Boolean(await cache.match(modelFileUrl(LOCAL_MODEL.sentinelFile)));
  } catch {
    return false;
  }
}

export function createLocalLlm(opts: { onEvent?: (e: WorkerEvent) => void } = {}): LocalLlm {
  if (import.meta.env.VITE_TEST_MODE === '1') return createFakeLlm(opts);

  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void; onText?: (c: string) => void }>();
  let loadWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  let ready = false;

  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL('../worker/local-llm.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerEvent>) => {
      const e = ev.data;
      opts.onEvent?.(e);
      if (e.type === 'ready') {
        ready = true;
        loadWaiters.forEach((w) => w.resolve());
        loadWaiters = [];
      } else if (e.type === 'token') {
        pending.get(e.id)?.onText?.(e.text);
      } else if (e.type === 'done') {
        pending.get(e.id)?.resolve(e.text);
        pending.delete(e.id);
      } else if (e.type === 'error') {
        const err = new Error(e.message);
        if (e.id !== undefined) {
          pending.get(e.id)?.reject(err);
          pending.delete(e.id);
        } else {
          loadWaiters.forEach((w) => w.reject(err));
          loadWaiters = [];
        }
      }
    };
    worker.onerror = (ev) => {
      const err = new Error(ev.message || 'Error en el worker del modelo local');
      loadWaiters.forEach((w) => w.reject(err));
      loadWaiters = [];
      pending.forEach((p) => p.reject(err));
      pending.clear();
    };
    return worker;
  };

  const send = (msg: WorkerRequest) => ensureWorker().postMessage(msg);

  return {
    load() {
      if (ready) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        loadWaiters.push({ resolve, reject });
        send({ type: 'load' });
      });
    },
    generate(prompt, onText) {
      const id = nextId++;
      return new Promise<string>((resolve, reject) => {
        pending.set(id, { resolve, reject, onText });
        send({ type: 'generate', id, prompt });
      });
    },
  };
}

/** Deterministic stand-in used only by the e2e build. */
function createFakeLlm(opts: { onEvent?: (e: WorkerEvent) => void }): LocalLlm {
  return {
    async load() {
      opts.onEvent?.({ type: 'device', device: 'wasm' });
      opts.onEvent?.({ type: 'progress', loaded: LOCAL_MODEL.approxBytes, total: LOCAL_MODEL.approxBytes, progress: 100 });
      opts.onEvent?.({ type: 'ready', device: 'wasm', loadMs: 1 });
    },
    async generate(prompt, onText) {
      const firma = /Nombre para la firma: (.*)/.exec(prompt.user)?.[1] ?? '';
      const empresa = /Empresa destino: (.*)/.exec(prompt.user)?.[1] ?? '';
      const text = `Estimado equipo de ${empresa}:\n\n[Borrador local simulado para pruebas e2e]\n\nAtentamente,\n${firma}`;
      onText?.(text);
      return text;
    },
  };
}
