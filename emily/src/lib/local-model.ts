/**
 * Local letter generator built on transformers.js. The SAME module runs:
 *   - in the browser, inside a Web Worker (src/worker/local-llm.worker.ts), on WebGPU or WASM;
 *   - in Node, from the evaluation harness (eval/), on WebGPU (Dawn) or CPU.
 * Same model id, same dtype, same chat template, same prompt builder ⇒ comparable results.
 *
 * Model choice and the problems we hit are documented in docs/decisiones.md.
 */
import {
  Gemma4Processor,
  pipeline,
  TextStreamer,
  type TextGenerationPipeline,
} from '@huggingface/transformers';
import { LOCAL_MODEL, modelFileUrl, TRANSFORMERS_CACHE_NAME } from './local-model-meta';
import { LETTER_GENERATION, type LetterPrompt } from './prompt';

export { LOCAL_MODEL, TRANSFORMERS_CACHE_NAME, modelFileUrl };

export type LocalDevice = 'webgpu' | 'wasm' | 'cpu';

export interface LoadProgress {
  loaded: number;
  total: number;
  progress: number;
}

export interface LocalGenerator {
  device: LocalDevice;
  generate(prompt: LetterPrompt, onText?: (chunk: string) => void, opts?: { maxNewTokens?: number; greedy?: boolean }): Promise<string>;
}

/**
 * Loads the model (downloading it the first time) and returns a generator.
 *
 * Gotcha: the ONNX repo ships the chat template as chat_template.jinja instead of inside
 * tokenizer_config.json, and the text-generation pipeline's tokenizer does not read that file.
 * Gemma4Processor does, so we load it only to obtain the template and pass it explicitly.
 */
export async function createLocalGenerator(opts: {
  device: LocalDevice;
  onProgress?: (p: LoadProgress) => void;
}): Promise<LocalGenerator> {
  const generator = (await pipeline('text-generation', LOCAL_MODEL.id, {
    dtype: LOCAL_MODEL.dtype,
    device: opts.device,
    progress_callback: (info: { status: string; loaded?: number; total?: number; progress?: number }) => {
      if (info.status === 'progress_total' && opts.onProgress) {
        opts.onProgress({ loaded: info.loaded ?? 0, total: info.total ?? LOCAL_MODEL.approxBytes, progress: info.progress ?? 0 });
      }
    },
  } as never)) as unknown as TextGenerationPipeline;

  const processor = (await Gemma4Processor.from_pretrained(LOCAL_MODEL.id)) as unknown as { chat_template?: string };
  const chat_template = processor.chat_template;
  if (!chat_template) throw new Error('No se encontró chat_template.jinja para el modelo local.');

  return {
    device: opts.device,
    async generate(prompt, onText, gen = {}) {
      const messages = [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ];
      const streamer = onText
        ? new TextStreamer(generator.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: onText })
        : undefined;
      const out = (await generator(messages as never, {
        max_new_tokens: gen.maxNewTokens ?? LETTER_GENERATION.maxOutputTokens,
        do_sample: !gen.greedy,
        temperature: LETTER_GENERATION.temperature,
        top_p: LETTER_GENERATION.topP,
        top_k: LETTER_GENERATION.topK,
        repetition_penalty: 1.05,
        streamer,
        chat_template,
      } as never)) as unknown as { generated_text: { role: string; content: string }[] }[];
      const last = out[0].generated_text.at(-1);
      return last?.content ?? '';
    },
  };
}
