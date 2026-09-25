import type { LetterPrompt } from '../lib/prompt';

/** Messages the page sends to the local-model worker. */
export type WorkerRequest =
  | { type: 'load' }
  | { type: 'generate'; id: number; prompt: LetterPrompt; maxNewTokens?: number };

/** Messages the worker sends back. */
export type WorkerEvent =
  | { type: 'device'; device: 'webgpu' | 'wasm' }
  | { type: 'progress'; loaded: number; total: number; progress: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm'; loadMs: number }
  | { type: 'token'; id: number; text: string }
  | { type: 'done'; id: number; text: string; ms: number }
  | { type: 'error'; id?: number; message: string };
