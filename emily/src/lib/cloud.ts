/**
 * Cloud boundary. The ONLY module that talks to a cloud model.
 *
 * It receives an already-built prompt (router.buildCloudPayload → prompt) and never sees the
 * profile, so it cannot leak what it does not have. It is exported as an object so tests can
 * spy on `cloud.generateLetter` (tests/leak.test.ts).
 */
import { getFirebaseAI } from './firebase';
import { LETTER_GENERATION, type LetterPrompt } from './prompt';

/** Cloud model used by the app (Gemini via Firebase AI Logic, Gemini Developer API backend). */
export const CLOUD_MODEL = 'gemini-3.8-flash';

export interface CloudLetter {
  text: string;
  model: string;
  latencyMs: number;
  usage?: { promptTokens?: number; outputTokens?: number; thoughtsTokens?: number };
}

export const cloud = {
  async generateLetter(prompt: LetterPrompt): Promise<CloudLetter> {
    const [ai, { getGenerativeModel }] = await Promise.all([getFirebaseAI(), import('firebase/ai')]);
    const model = getGenerativeModel(ai, {
      model: CLOUD_MODEL,
      systemInstruction: prompt.system,
      generationConfig: {
        temperature: LETTER_GENERATION.temperature,
        topP: LETTER_GENERATION.topP,
        // generous: gemini-3.x counts thinking tokens against the output budget
        maxOutputTokens: 4096,
      },
    });
    const t0 = performance.now();
    const result = await model.generateContent(prompt.user);
    const latencyMs = performance.now() - t0;
    const u = result.response.usageMetadata;
    return {
      text: result.response.text(),
      model: CLOUD_MODEL,
      latencyMs,
      usage: u
        ? { promptTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, thoughtsTokens: u.thoughtsTokenCount }
        : undefined,
    };
  },
};
