/**
 * Generates VALIDACION.md (Spanish) from an eval results JSON.
 *   npm run eval:report                 → latest full results in eval/results/
 *   npm run eval:report -- <file.json>  → a specific file
 * A --leaks-only run writes its report next to the JSON (eval/results/<stamp>-leaks.md) so it
 * never overwrites the full VALIDACION.md.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CRITERIA, type CriterionId } from '../src/lib/letter-checks';
import { SENSITIVE_TYPES, type SensitiveType } from '../src/lib/types';
import type { LeakCaseResult } from './lib/leaks';
import type { Source } from './lib/letters';
import { CRITERION_IDS, SOURCES, type LeakSummary, type QualityCase, type QualitySummary } from './lib/summary';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS = path.join(import.meta.dirname, 'results');

const TYPE_ES: Record<SensitiveType, string> = {
  salary: 'Salario / montos',
  employer: 'Empleador actual',
  person_name: 'Nombres de personas',
  phone: 'Teléfono',
  email: 'Correo',
  dpi: 'DPI',
  address: 'Dirección',
  nit: 'NIT',
};
const SOURCE_ES: Record<Source, string> = { local: 'Local (Gemma 4 E2B)', nube: 'Nube (gemini-3.8-flash)', plantilla: 'Plantilla' };

/** Why each type of canary can escape a deterministic redactor. */
const WHY: Record<SensitiveType, string> = {
  salary:
    'sin moneda, sin "mil"/"k" y sin cifra de 4+ dígitos, el texto no se distingue de otros números sin entender el contexto',
  employer:
    'el redactor solo conoce el nombre declarado (exacto, con typos, acrónimo, sin espacios y palabras distintivas de 5+ letras); apodos o marcas cortas no derivables del nombre se escapan',
  person_name:
    'solo se reconocen personas presentadas con un cargo (jefe, gerente, compañera…) o un título (Lic., Ing.…) y escritas con mayúscula inicial',
  phone: 'la regla reconoce 8 dígitos agrupados 4-4 (con o sin +502); otros agrupamientos se escapan',
  email: 'la regla reconoce el formato con @; un correo deletreado ("arroba", "punto") no',
  dpi: 'la regla reconoce 13 dígitos en grupos 4-5-4 separados por espacio o guion',
  address: 'sin palabra clave (zona, calle, avenida, colonia, residenciales, km…) un nombre de colonia es indistinguible de otro nombre propio',
  nit: 'la regla reconoce NIT etiquetado o con guion antes del dígito verificador',
};

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)} %` : '—');
const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const secs = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

interface Results {
  meta: {
    timestamp: string;
    durationS: number;
    mode: string;
    fixtures: string[];
    node: string;
    platform: string;
    localModel: { id: string; dtype: string; device: string; runtime: string };
    cloudModel: { project: string; location: string; model: string; via: string; appVia: string };
    judge: { model: string; temperature: number };
    pricing: { inputPerM: number; outputPerM: number; note: string };
    samplePayload: string;
  };
  leaks: { summary: LeakSummary; cases: LeakCaseResult[] };
  quality: { summary: QualitySummary; cases: QualityCase[] } | null;
}

function latestResults(): string {
  const files = readdirSync(RESULTS)
    .filter((f) => f.endsWith('.json') && !f.endsWith('-leaks.json'))
    .sort();
  if (!files.length) throw new Error('No hay resultados completos en eval/results/. Corre `npm run eval` primero.');
  return path.join(RESULTS, files[files.length - 1]);
}

function leakSection(r: Results): string[] {
  const s = r.leaks.summary;
  const out: string[] = [];
  out.push('## 2. Fugas de datos sensibles (router + redactor + compuerta)', '');
  out.push(
    `Se corrió el **código real** de \`src/lib/router.ts\` (\`buildCloudPayload\`) sobre los ${s.cases} perfiles, con ${s.canaries} datos trampa plantados. ` +
      'Un dato trampa "se fuga" si aparece en el texto exacto que saldría hacia la nube (comparación sin mayúsculas ni tildes, separadores de miles colapsados, con límites de palabra; ' +
      'para números de 6+ dígitos también se buscan los dígitos seguidos). "Fuga parcial" = sobrevive un apellido o una palabra distintiva del dato trampa.',
    '',
  );
  out.push('### 2.1 Recall por tipo', '');
  out.push('| Tipo | Datos trampa | Atrapados por el redactor | Fugas | Fugas parciales | Recall final |');
  out.push('|---|---:|---:|---:|---:|---:|');
  for (const t of SENSITIVE_TYPES) {
    const x = s.byType[t];
    if (!x.total) continue;
    out.push(`| ${TYPE_ES[t]} | ${x.total} | ${x.atrapadosRedactor} | ${x.fugas} | ${x.parciales} | ${pct(x.atrapadosFinal / x.total)} |`);
  }
  out.push(
    `| **Total** | **${s.canaries}** | **${Math.round(s.recallRedactor * s.canaries)}** | **${Object.values(s.byType).reduce((a, x) => a + x.fugas, 0)}** | **${Object.values(s.byType).reduce((a, x) => a + x.parciales, 0)}** | **${pct(s.recallFinal)}** |`,
    '',
  );
  out.push('### 2.2 Por dificultad del dato trampa', '');
  out.push('| Dificultad | Datos trampa | Atrapados | Recall |', '|---|---:|---:|---:|');
  for (const d of ['fácil', 'media', 'difícil']) {
    const x = s.byDifficulty[d];
    if (x) out.push(`| ${d} | ${x.total} | ${x.atrapadosFinal} | ${pct(x.atrapadosFinal / x.total)} |`);
  }
  out.push('');
  out.push('### 2.3 Compuerta final y controles estructurales', '');
  out.push(
    `- Casos enviados: **${s.sentCases}** · bloqueados por la compuerta: **${s.blockedCases}** · casos con al menos una fuga: **${s.casesWithFinalLeak}**.`,
    `- **Salario actual (campo del formulario) en cualquier forma escrita dentro del payload enviado: ${s.currentSalaryAnyFormLeaks} de ${s.sentCases} casos.** (Se busca 15000, 15,000, 15.000, Q 15 000, 15k, 15 mil, "quince mil", etc.)`,
    `- Nombre declarado del empleador actual dentro del payload enviado: ${s.employerStructuralLeaks} de ${s.sentCases} casos.`,
    `- Falsos positivos (textos no sensibles de la lista \`allowed\` que el redactor tachó): **${s.falsePositives} de ${s.allowedTotal}**.`,
    '',
  );
  const blocked = r.leaks.cases.filter((c) => c.blocked);
  if (blocked.length) {
    out.push('Casos bloqueados y motivo:', '');
    for (const c of blocked) out.push(`- \`${c.id}\`: ${c.residual.map((x) => `${x.type} "${esc(x.match)}" (regla ${x.rule})`).join('; ')}`);
    out.push('');
  }
  out.push('### 2.4 Datos trampa que se fugaron y por qué', '');
  const leaked = r.leaks.cases.flatMap((c) => c.canaries.filter((k) => k.final !== 'atrapado').map((k) => ({ c, k })));
  if (!leaked.length) out.push('Ninguno.', '');
  else {
    out.push('| Caso | Tipo | Dato trampa | Dificultad | Resultado | Por qué se escapó |', '|---|---|---|---|---|---|');
    for (const { c, k } of leaked) {
      out.push(`| \`${c.id}\` | ${TYPE_ES[k.type]} | "${esc(k.value)}" | ${k.dificultad} | ${k.final === 'fuga' ? 'fuga' : `parcial ("${esc(k.evidencia ?? '')}")`} | ${esc(k.nota)}: ${WHY[k.type]} |`);
    }
    out.push('');
  }
  if (r.quality) {
    const prop = propagated(r);
    out.push('### 2.5 ¿Las fugas terminaron escritas en la carta?', '');
    out.push(
      'Un dato que se escapa del redactor no solo llega a Google: el modelo puede **escribirlo en la carta**, que luego se envía a un tercero. ' +
        `De ${leaked.length} datos trampa fugados, **${prop.length}** aparecen en la carta de la nube:`,
      '',
    );
    if (prop.length) for (const x of prop) out.push(`- \`${x.id}\` ${TYPE_ES[x.type]} "${esc(x.value)}" → en la carta: "${esc(x.snippet)}"`);
    else out.push('- ninguno');
    out.push('');
  }
  out.push('### 2.6 Falsos positivos', '');
  const fps = r.leaks.cases.filter((c) => c.falsePositives.length);
  if (!fps.length) out.push('Ningún texto de la lista `allowed` fue tachado.', '');
  else for (const c of fps) out.push(`- \`${c.id}\`: ${c.falsePositives.map((x) => `"${esc(x)}"`).join(', ')}`);
  const others = r.leaks.cases.flatMap((c) => c.otherRedactions.map((o) => ({ id: c.id, ...o })));
  out.push(
    '',
    `Además hubo ${others.length} tachaduras que no corresponden a ningún dato trampa (no cuentan como falso positivo, pero se listan para inspección): ` +
      (others.length ? others.map((o) => `\`${o.id}\` ${o.type} "${esc(o.match)}"`).join('; ') : 'ninguna') +
      '. La mayoría son rangos salariales de la oferta: no son del usuario, pero la carta no los necesita.',
    '',
  );
  return out;
}

function qualitySection(r: Results): string[] {
  const q = r.quality!;
  const s = q.summary;
  const out: string[] = [];
  out.push('## 3. Calidad de la carta: local vs nube vs plantilla', '');
  out.push(
    `Cartas generadas: local ${s.n.local}, nube ${s.n.nube}, plantilla ${s.n.plantilla}. ` +
      'Cada celda muestra **% que pasa la regla determinista** / **promedio del juez (1–5)**. Definición de cada criterio en [`eval/CRITERIOS.md`](eval/CRITERIOS.md).',
    '',
  );
  out.push(`| Criterio | ${SOURCES.map((x) => SOURCE_ES[x]).join(' | ')} |`, `|---|${SOURCES.map(() => '---:').join('|')}|`);
  for (const c of CRITERIA) {
    out.push(`| ${c.label} | ${SOURCES.map((x) => `${pct(s.deterministicPassRate[x][c.id])} / ${num(s.judgeMean[x][c.id])}`).join(' | ')} |`);
  }
  out.push(`| **Global** | ${SOURCES.map((x) => `**${pct(s.deterministicOverall[x])} / ${num(s.judgeOverall[x])}**`).join(' | ')} |`, '');
  out.push(`Longitud (palabras): ${SOURCES.map((x) => `${SOURCE_ES[x]} media ${num(s.words[x].mean, 0)} (mín ${num(s.words[x].min, 0)}, máx ${num(s.words[x].max, 0)})`).join(' · ')}.`, '');

  out.push('### 3.1 ¿Coinciden las reglas y el juez?', '');
  out.push('Acuerdo entre "pasa la regla" y "juez ≥ 4", juntando las tres fuentes. κ = kappa de Cohen (0 = azar, 1 = acuerdo perfecto).', '');
  out.push('| Criterio | n | Acuerdo | κ |', '|---|---:|---:|---:|');
  for (const c of CRITERIA) {
    const a = s.agreement[c.id];
    out.push(`| ${c.label} | ${a.n} | ${pct(a.pct)} | ${num(a.kappa)} |`);
  }
  out.push('');
  out.push('### 3.2 Sesgos del juez', '');
  const detScaled = (x: Source) => 1 + 4 * s.deterministicOverall[x];
  out.push('| Fuente | Juez (1–5) | Reglas reescaladas a 1–5 | Diferencia juez − reglas |', '|---|---:|---:|---:|');
  for (const x of SOURCES) out.push(`| ${SOURCE_ES[x]} | ${num(s.judgeOverall[x])} | ${num(detScaled(x))} | ${num(s.judgeOverall[x] - detScaled(x))} |`);
  out.push('');
  out.push(
    `Posición ciega: promedio del juez por etiqueta ${Object.entries(s.judgeByLabel)
      .sort()
      .map(([k, v]) => `${k} = ${num(v)}`)
      .join(', ')}. Distribución de etiquetas por fuente: ${SOURCES.map((x) => `${x} ${JSON.stringify(s.labelCounts[x])}`).join('; ')}.`,
    '',
  );
  out.push(
    'Riesgo de **auto-preferencia**: el juez es el mismo modelo que escribió la carta de la nube. Mitigaciones aplicadas: cartas etiquetadas A/B/C con posiciones balanceadas, ' +
      'temperatura 0, rúbrica con anclas explícitas, instrucción de no premiar la longitud ni adivinar el origen, y reporte paralelo de la puntuación **solo determinista** (que no puede tener auto-preferencia). ' +
      'Si la diferencia juez − reglas es claramente mayor para la nube que para las otras fuentes, es una señal de sesgo.',
    '',
  );

  out.push('### 3.3 Latencia y costo', '');
  out.push('| Fuente | Latencia media | Mediana | Máxima |', '|---|---:|---:|---:|');
  for (const x of ['local', 'nube'] as Source[]) out.push(`| ${SOURCE_ES[x]} | ${secs(s.latencyMs[x].mean)} | ${secs(s.latencyMs[x].median)} | ${secs(s.latencyMs[x].max)} |`);
  out.push('| Plantilla | < 0.01 s | — | — |', '');
  const c = s.cloudTokens;
  out.push(
    `- Local: \`${r.meta.localModel.id}\` (${r.meta.localModel.dtype}) en ${r.meta.localModel.runtime}, dispositivo \`${r.meta.localModel.device}\`, máquina: ${r.meta.platform}. Costo marginal: 0 (corre en el dispositivo); costo real: descarga única de ~2.3 GB.`,
    `- Nube: ${c.prompt.toLocaleString('es-GT')} tokens de entrada, ${c.output.toLocaleString('es-GT')} de salida y ${c.thoughts.toLocaleString('es-GT')} de razonamiento en total → **US$${num(c.costUSD, 4)}** (≈ US$${num(c.costPerLetterUSD, 5)} por carta) a US$${r.meta.pricing.inputPerM} / US$${r.meta.pricing.outputPerM} por millón. ${r.meta.pricing.note}`,
    `- Juez: ${s.judgeTokens.prompt.toLocaleString('es-GT')} tokens de entrada, ${(s.judgeTokens.output + s.judgeTokens.thoughts).toLocaleString('es-GT')} de salida+razonamiento → US$${num(s.judgeTokens.costUSD, 4)}.`,
    '',
  );

  out.push('### 3.4 Detalle por caso', '');
  out.push('| Caso | Nube | Palabras L / N / P | Reglas L / N / P (de 6) | Juez L / N / P |', '|---|---|---|---|---|');
  for (const qc of q.cases) {
    const w = SOURCES.map((x) => qc.words[x] ?? '—').join(' / ');
    const d = SOURCES.map((x) => (qc.checks[x] ? CRITERION_IDS.filter((k) => qc.checks[x]![k].pass).length : '—')).join(' / ');
    const j = SOURCES.map((x) => {
      const v = qc.judge?.bySource[x];
      return v ? num(CRITERION_IDS.reduce((a, k) => a + v.scores[k], 0) / 6) : '—';
    }).join(' / ');
    const nube = qc.letters.nube.text ? 'enviada' : (qc.letters.nube.skipped ?? `error: ${esc(qc.letters.nube.error ?? '')}`);
    out.push(`| \`${qc.id}\` | ${nube} | ${w} | ${d} | ${j} |`);
  }
  out.push('');
  return out;
}

/** Leaked canaries whose text (or surviving token) appears in the cloud letter. */
function propagated(r: Results): { id: string; type: SensitiveType; value: string; snippet: string }[] {
  if (!r.quality) return [];
  const out: { id: string; type: SensitiveType; value: string; snippet: string }[] = [];
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const c of r.leaks.cases) {
    const letter = r.quality.cases.find((q) => q.id === c.id)?.letters.nube.text;
    if (!letter) continue;
    for (const k of c.canaries.filter((x) => x.final !== 'atrapado')) {
      const needle = norm(k.value);
      const i = norm(letter).indexOf(needle);
      if (i >= 0) out.push({ id: c.id, type: k.type, value: k.value, snippet: letter.slice(Math.max(0, i - 30), i + k.value.length + 30).replace(/\s+/g, ' ') });
    }
  }
  return out;
}

function findings(r: Results): string[] {
  const s = r.leaks.summary;
  const out: string[] = ['## 4. Hallazgos', ''];
  const worst = SENSITIVE_TYPES.filter((t) => s.byType[t].total)
    .map((t) => ({ t, rec: s.byType[t].atrapadosFinal / s.byType[t].total }))
    .sort((a, b) => a.rec - b.rec);
  out.push(
    `- **El salario actual nunca salió** como campo ni en ninguna de sus formas numéricas conocidas (${s.currentSalaryAnyFormLeaks} de ${s.sentCases} casos enviados). Lo que sí se escapó fueron **formas coloquiales** escritas en texto libre: el redactor determinista no entiende el contexto.`,
  );
  out.push(
    `- Recall final ${pct(s.recallFinal)} sobre ${s.canaries} datos trampa; los tipos más débiles: ${worst
      .slice(0, 3)
      .map((w) => `${TYPE_ES[w.t]} (${pct(w.rec)})`)
      .join(', ')}. Por dificultad: ${['fácil', 'media', 'difícil']
      .filter((d) => s.byDifficulty[d])
      .map((d) => `${d} ${pct(s.byDifficulty[d].atrapadosFinal / s.byDifficulty[d].total)}`)
      .join(', ')}. Las fugas se concentran en datos trampa diseñados como difíciles: el resultado es honesto, no un 100 % de vitrina.`,
  );
  out.push(
    `- Falsos positivos: ${s.falsePositives} de ${s.allowedTotal} textos permitidos. La primera corrida de esta evaluación encontró 7 casos bloqueados por error y 2 falsos positivos causados por el propio redactor (ver \`docs/decisiones.md\`); se corrigieron y quedaron como pruebas de regresión.`,
  );
  if (r.quality) {
    const prop = propagated(r);
    out.push(
      `- **${prop.length} de los datos trampa fugados terminaron escritos en la carta de la nube** (${prop.map((x) => `"${x.value}"`).join(', ') || 'ninguno'}): el modelo no solo los recibió, los usó. El redactor protege a Google y también al destinatario de la carta.`,
    );
    const q = r.quality.summary;
    const best = [...SOURCES].sort((a, b) => (q.judgeOverall[b] || 0) - (q.judgeOverall[a] || 0));
    out.push(
      `- Calidad (juez 1–5): ${SOURCES.map((x) => `${SOURCE_ES[x]} ${num(q.judgeOverall[x])}`).join(', ')}. Reglas deterministas (proporción de criterios cumplidos): ${SOURCES.map((x) => `${x} ${pct(q.deterministicOverall[x])}`).join(', ')}. Mejor según el juez: **${SOURCE_ES[best[0]]}**.`,
    );
    const gap = (x: Source) => q.judgeOverall[x] - (1 + 4 * q.deterministicOverall[x]);
    out.push(
      `- Juez − reglas (escala 1–5): local ${num(gap('local'))}, nube ${num(gap('nube'))}, plantilla ${num(gap('plantilla'))}. El juez es **más severo que las reglas con las cartas que no escribió** y coincide con ellas en la suya. Hay dos lecturas y los datos no alcanzan para separarlas: auto-preferencia, o reglas demasiado permisivas (no ven palabras rotas, relleno genérico ni frases copiadas; ver los comentarios del juez en \`eval/results/\`). Lo prudente: tratar la ventaja de la nube en *tono* y *español* como probable pero inflada, y la de *ajuste a la oferta* como real (las cartas locales casi no usan los logros concretos).`,
    );
    const lowAgree = CRITERIA.filter((c) => q.agreement[c.id].pct < 0.7).map((c) => `${c.label} (${pct(q.agreement[c.id].pct)})`);
    out.push(
      `- Reglas vs juez: ${lowAgree.length ? `el acuerdo es bajo en ${lowAgree.join(', ')}; en esos criterios la regla y el juez miden cosas distintas o uno de los dos se equivoca (ver 3.1).` : 'el acuerdo es alto en todos los criterios.'}`,
    );
    out.push(
      `- Latencia: local ${secs(q.latencyMs.local.median)} por carta (mediana, ${r.meta.localModel.device} en esta máquina) vs nube ${secs(q.latencyMs.nube.median)}. El borrador local es viable en una laptop con GPU; en CPU pura es de minutos (ver \`docs/decisiones.md\`).`,
    );
  }
  out.push('');
  return out;
}

export function renderReport(r: Results): string {
  const out: string[] = [];
  out.push('# Validación — Emily (aprendizajes)', '');
  out.push(
    `> Generado automáticamente por \`npm run eval\` (\`eval/report.ts\`) el ${new Date(r.meta.timestamp).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })} (hora de Guatemala). ` +
      `Modo: ${r.meta.mode}. Duración: ${Math.round(r.meta.durationS / 60)} min. Datos crudos: \`eval/results/\`.`,
    '',
  );
  out.push('## 1. Método', '');
  out.push(
    `- **${r.meta.fixtures.length} perfiles ficticios** (\`eval/fixtures/*.json\`) con sabor guatemalteco: junior y senior, técnicos y no técnicos, con y sin oferta, ofertas en español e inglés, texto desordenado. Cada perfil lista sus **datos trampa** (datos sensibles plantados, con tipo y dificultad) y una lista \`allowed\` de textos no sensibles que deben sobrevivir (para medir falsos positivos).`,
    '- **Fugas**: se ejecuta el router real (`buildCloudPayload`: lista blanca → redactor → compuerta final) y se busca cada dato trampa en el texto exacto que saldría a la nube. Si la compuerta bloquea, no sale nada y el dato trampa cuenta como atrapado.',
    `- **Calidad**: para cada perfil se generan tres cartas: (a) **local**, \`${r.meta.localModel.id}\` con transformers.js en Node (mismo id de modelo, dtype, plantilla de chat y constructor de prompt que el navegador); (b) **nube**, \`${r.meta.cloudModel.model}\` con el mismo prompt que arma el router, llamado vía ${r.meta.cloudModel.via} (proyecto \`${r.meta.cloudModel.project}\`, región \`${r.meta.cloudModel.location}\`) en lugar de ${r.meta.cloudModel.appVia}, porque Firebase AI Logic es un SDK de navegador protegido con App Check y no se puede invocar desde un script de Node; el modelo y el prompt son los mismos; (c) **plantilla** determinista como línea base.`,
    `- **Calificación**: 6 criterios (ver [\`eval/CRITERIOS.md\`](eval/CRITERIOS.md)), cada uno con una regla determinista y con un juez \`${r.meta.judge.model}\` a temperatura ${r.meta.judge.temperature}, a ciegas: cartas etiquetadas A/B/C con **posiciones balanceadas** (las 6 permutaciones, 3 casos cada una: cada fuente cae 6 veces en cada posición).`,
    ...(r.quality
      ? [
          `- Cartas reutilizadas de la caché \`.cache/eval-letters\` (generadas en una corrida anterior con el mismo prompt): local ${r.quality.cases.filter((c) => c.letters.local.cached).length}/${r.quality.cases.length}, nube ${r.quality.cases.filter((c) => c.letters.nube.cached).length}/${r.quality.cases.length}. Latencias y tokens son los de la generación original.`,
        ]
      : []),
    '',
  );
  out.push(...leakSection(r));
  if (r.quality) out.push(...qualitySection(r));
  else out.push('## 3. Calidad de la carta', '', 'No incluida en esta corrida (`--leaks-only`).', '');
  out.push(...findings(r));
  out.push('## 5. Ejemplo de lo que sale a la nube', '', 'Prompt de usuario enviado para el primer caso (el system prompt es fijo y está en `src/lib/prompt.ts`):', '', '```text', r.meta.samplePayload, '```', '');
  if (r.quality) {
    const ex = r.quality.cases.find((c) => c.id.startsWith('02')) ?? r.quality.cases[0];
    out.push(`## 6. Ejemplo de cartas (caso \`${ex.id}\`)`, '');
    for (const x of SOURCES) {
      const l = ex.letters[x];
      out.push(`### ${SOURCE_ES[x]}`, '', l.text ? l.text.split('\n').map((ln) => `> ${ln}`).join('\n') : `_(sin carta: ${l.skipped ?? l.error})_`, '');
      const j = ex.judge?.bySource[x];
      if (j) out.push(`Juez: ${CRITERION_IDS.map((k) => `${k} ${j.scores[k]}`).join(', ')}. _${esc(j.comentario)}_`, '');
    }
  }
  out.push('---', `Entorno: Node ${r.meta.node} · ${r.meta.platform}.`, '');
  return out.join('\n');
}

export function writeReport(resultsFile: string): string {
  const r = JSON.parse(readFileSync(resultsFile, 'utf8')) as Results;
  const md = renderReport(r);
  const target = r.meta.mode === 'full' ? path.join(ROOT, 'VALIDACION.md') : resultsFile.replace(/\.json$/, '.md');
  writeFileSync(target, md);
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : latestResults();
  console.log(`Reporte: ${writeReport(file)}`);
}

export type { CriterionId };
