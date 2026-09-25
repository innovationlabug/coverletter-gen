/**
 * Metadata of the local model, split from local-model.ts so the main thread can show size /
 * cache state without importing transformers.js (which lives in the worker bundle).
 */
export const LOCAL_MODEL = {
  id: 'onnx-community/gemma-4-E2B-it-qat-mobile-ONNX',
  /** QAT "mobile" weights: 2-bit decoder layers, fp16 activations. */
  dtype: 'q2f16',
  /** Files actually downloaded for text-only generation (embed_tokens + decoder_model_merged). */
  approxBytes: 2_324_000_000,
  label: 'Gemma 4 E2B (QAT móvil, ONNX q2f16)',
  /** Largest file; its presence in Cache Storage means "model already downloaded". */
  sentinelFile: 'onnx/decoder_model_merged_q2f16.onnx_data',
} as const;

/** Cache Storage bucket used by transformers.js in the browser (env.cacheKey default). */
export const TRANSFORMERS_CACHE_NAME = 'transformers-cache';

export function modelFileUrl(file: string): string {
  return `https://huggingface.co/${LOCAL_MODEL.id}/resolve/main/${file}`;
}
