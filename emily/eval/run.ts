/**
 * Evaluation harness.  npm run eval            → full run (leaks + letters local/cloud/template + judge)
 *                      npm run eval -- --leaks-only   → only router/redactor metrics (no models, seconds)
 * Other flags: --only=01,07   --device=webgpu|cpu   --fresh (ignore letter cache)
 *              --skip-local   --skip-cloud   --skip-judge   --no-report
 * Writes eval/results/<timestamp>.json and regenerates VALIDACION.md (eval/report.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLetter } from '../src/lib/letter-checks';
import { LOCAL_MODEL } from '../src/lib/local-model-meta';
import { buildCloudPayload } from '../src/lib/router';
import { wordCount } from '../src/lib/text';
import { loadFixtures } from './lib/fixtures';
import { judgeCase } from './lib/judge';
import { evaluateLeaks } from './lib/leaks';
import { cloudLetter, localLetter, templateLetter, VERTEX, type GeneratedLetter, type Source } from './lib/letters';
import { PRICING, summarizeLeaks, summarizeQuality, type QualityCase } from './lib/summary';
import { writeReport } from './report';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const leaksOnly = flag('leaks-only');
const only = opt('only')?.split(',').filter(Boolean);
const device = (opt('device') ?? 'webgpu') as 'webgpu' | 'cpu';
const fresh = flag('fresh');

const t0 = Date.now();
const fixtures = loadFixtures(only);
console.log(`\n== Evaluación Emily: ${fixtures.length} casos${leaksOnly ? ' (solo fugas)' : ''} ==\n`);

// 1) Leaks (always)
const leakCases = fixtures.map(evaluateLeaks);
const leakSummary = summarizeLeaks(leakCases);
for (const c of leakCases) {
  const bad = c.canaries.filter((k) => k.final !== 'atrapado');
  console.log(
    `${c.blocked ? 'BLOQUEADO' : 'enviado  '} ${c.id.padEnd(38)} datos ficticios ${c.canaries.length - bad.length}/${c.canaries.length}` +
      (bad.length ? `  fugas: ${bad.map((k) => `${k.type}:"${k.value}"`).join(', ')}` : '') +
      (c.falsePositives.length ? `  FP: ${c.falsePositives.join(', ')}` : ''),
  );
}
console.log(
  `\nRecall redactor ${(leakSummary.recallRedactor * 100).toFixed(1)} % · recall final ${(leakSummary.recallFinal * 100).toFixed(1)} % · ` +
    `FP ${leakSummary.falsePositives}/${leakSummary.allowedTotal} · salario actual en payload: ${leakSummary.currentSalaryAnyFormLeaks} casos`,
);

// 2) Letters + judge
const quality: QualityCase[] = [];
if (!leaksOnly) {
  for (const [i, fx] of fixtures.entries()) {
    const p = fx.profile;
    process.stdout.write(`\n[${i + 1}/${fixtures.length}] ${fx.id}\n`);
    const letters = {} as Record<Source, GeneratedLetter>;
    letters.plantilla = templateLetter(p);
    letters.local = flag('skip-local') ? { source: 'local', text: null, skipped: '--skip-local' } : await localLetter(fx.id, p, device, fresh);
    process.stdout.write(
      `  local: ${letters.local.text ? `${wordCount(letters.local.text)} palabras, ${((letters.local.latencyMs ?? 0) / 1000).toFixed(1)} s${letters.local.cached ? ' (caché)' : ''} [${letters.local.device ?? ''}]` : letters.local.error ?? letters.local.skipped}\n`,
    );
    letters.nube = flag('skip-cloud') ? { source: 'nube', text: null, skipped: '--skip-cloud' } : await cloudLetter(fx.id, p, fresh);
    process.stdout.write(
      `  nube:  ${letters.nube.text ? `${wordCount(letters.nube.text)} palabras, ${((letters.nube.latencyMs ?? 0) / 1000).toFixed(1)} s${letters.nube.cached ? ' (caché)' : ''}` : letters.nube.error ?? letters.nube.skipped}\n`,
    );
    const qc: QualityCase = { id: fx.id, letters, checks: {}, words: {} };
    for (const s of ['local', 'nube', 'plantilla'] as Source[]) {
      const t = letters[s].text;
      if (!t) continue;
      qc.checks[s] = checkLetter(t, p);
      qc.words[s] = wordCount(t);
    }
    if (!flag('skip-judge')) {
      qc.judge = await judgeCase(fx.id, i, p, { local: letters.local.text, nube: letters.nube.text, plantilla: letters.plantilla.text });
      if (qc.judge.error) process.stdout.write(`  juez: ERROR ${qc.judge.error}\n`);
      else
        process.stdout.write(
          `  juez: ${Object.entries(qc.judge.bySource)
            .map(([s, v]) => `${s}=${(Object.values(v!.scores).reduce((a, b) => a + b, 0) / 6).toFixed(2)}`)
            .join(' ')}\n`,
        );
    }
    quality.push(qc);
  }
}

const qualitySummary = quality.length ? summarizeQuality(quality) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const results = {
  meta: {
    timestamp: new Date().toISOString(),
    durationS: (Date.now() - t0) / 1000,
    mode: leaksOnly ? 'leaks-only' : 'full',
    fixtures: fixtures.map((f) => f.id),
    node: process.version,
    platform: `${os.platform()} ${os.arch()} · ${os.cpus()[0]?.model ?? ''} · ${(os.totalmem() / 1e9).toFixed(0)} GB RAM`,
    localModel: { id: LOCAL_MODEL.id, dtype: LOCAL_MODEL.dtype, device, runtime: 'transformers.js (Node, onnxruntime-node)' },
    cloudModel: { ...VERTEX, via: '@google/genai (Vertex AI, ADC)', appVia: 'Firebase AI Logic (GoogleAIBackend)' },
    judge: { model: VERTEX.model, temperature: 0, blind: true },
    pricing: PRICING,
    samplePayload: fixtures.length ? `${buildCloudPayload(fixtures[0].profile).prompt.user}` : '',
  },
  leaks: { summary: leakSummary, cases: leakCases },
  quality: qualitySummary ? { summary: qualitySummary, cases: quality } : null,
};

const outDir = path.resolve(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${stamp}${leaksOnly ? '-leaks' : ''}.json`);
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nResultados: ${path.relative(process.cwd(), outFile)}`);

if (!flag('no-report')) {
  const md = writeReport(outFile);
  console.log(`Reporte:    ${path.relative(process.cwd(), md)}`);
}
console.log(`Duración: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
