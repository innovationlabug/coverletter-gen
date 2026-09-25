import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './styles.css';

import { isFirebaseConfigured } from './firebase-config';
import { createLocalLlm, isModelCached } from './lib/local-llm-client';
import { LOCAL_MODEL } from './lib/local-model-meta';
import { formatMoney } from './lib/money';
import { buildNegotiationNote, type NegotiationNote } from './lib/negotiation';
import { generateAll, type GenerateResult } from './lib/orchestrator';
import { buildLetterPrompt, finalizeLetter, localLetterInput } from './lib/prompt';
import { buildTemplateLetter } from './lib/template';
import type { Currency, Profile, SensitiveType } from './lib/types';
import { EXAMPLE_PROFILE } from './ui/example';

/**
 * UI. Two steps: "tus datos" (form) → "tu carta" (one letter + private note).
 * The letter shown by default is the best one available: online (cloud) → on this device (local
 * model, if downloaded) → base (template). How the cloud request is built and gated lives in
 * src/lib/router.ts; the UI deliberately does not surface it (see README §8).
 */

type Version = 'nube' | 'local' | 'plantilla';

const TEST_MODE = import.meta.env.VITE_TEST_MODE === '1';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const form = $<HTMLFormElement>('#perfil');

const state: {
  profile: Profile | null;
  base: { note: NegotiationNote; template: string } | null;
  result: GenerateResult | null;
  cloudPending: boolean;
  run: number;
  view: Version;
  userPicked: boolean;
  model: { phase: 'idle' | 'loading' | 'ready' | 'failed'; cached: boolean; webgpu: boolean | null; loaded: number; total: number };
  draft: { status: 'none' | 'writing' | 'done' | 'failed'; text: string; run: number };
} = {
  profile: null,
  base: null,
  result: null,
  cloudPending: false,
  run: 0,
  view: 'plantilla',
  userPicked: false,
  model: { phase: 'idle', cached: false, webgpu: null, loaded: 0, total: LOCAL_MODEL.approxBytes },
  draft: { status: 'none', text: '', run: 0 },
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

// ---------------------------------------------------------------------------
// Steps (form → results), with browser back support
// ---------------------------------------------------------------------------

function showStep(step: 'datos' | 'carta', focus = true) {
  const results = step === 'carta';
  $('#paso-datos').hidden = results;
  $('#paso-carta').hidden = !results;
  $('#editar').hidden = !results;
  document.body.dataset.step = step;
  window.scrollTo({ top: 0 });
  if (!focus) return;
  if (results) $('#results-title').focus({ preventScroll: true });
  else $('#intake-title').focus({ preventScroll: true });
}

$('#editar').addEventListener('click', () => {
  if (history.state?.step === 'carta') history.back();
  else showStep('datos');
});

window.addEventListener('popstate', (e) => {
  showStep(e.state?.step === 'carta' && state.base ? 'carta' : 'datos');
});

// ---------------------------------------------------------------------------
// Offline banner
// ---------------------------------------------------------------------------

function renderNetwork() {
  $('#offline').hidden = navigator.onLine;
}
window.addEventListener('online', renderNetwork);
window.addEventListener('offline', renderNetwork);

// ---------------------------------------------------------------------------
// Local model ("Usar sin internet")
// ---------------------------------------------------------------------------

const llm = createLocalLlm({
  onEvent(e) {
    if (e.type === 'progress') {
      state.model.loaded = e.loaded;
      state.model.total = e.total || LOCAL_MODEL.approxBytes;
      renderModel();
    }
  },
});

let modelLoad: Promise<boolean> | null = null;

function modelAvailable(): boolean {
  return state.model.phase === 'ready' || (state.model.cached && state.model.phase !== 'failed');
}

function ensureModel(): Promise<boolean> {
  if (state.model.phase === 'ready') return Promise.resolve(true);
  modelLoad ??= (async () => {
    state.model.phase = 'loading';
    renderModel();
    try {
      await llm.load();
      state.model.phase = 'ready';
      state.model.cached = true;
      return true;
    } catch (err) {
      console.warn('[emily] modelo local:', err);
      state.model.phase = 'failed';
      return false;
    } finally {
      modelLoad = null;
      renderModel();
      renderLetter();
    }
  })();
  return modelLoad;
}

async function writeLocalDraft() {
  const profile = state.profile;
  const d = state.draft;
  if (!profile || d.status === 'writing' || (d.status === 'done' && d.run === state.run)) return;
  const run = state.run;
  state.draft = { status: 'writing', text: '', run };
  renderLetter();
  if (!(await ensureModel())) {
    if (state.draft.run === run) state.draft.status = 'failed';
    if (state.view === 'local') state.view = bestVersion();
    renderLetter();
    return;
  }
  try {
    const raw = await llm.generate(buildLetterPrompt(localLetterInput(profile)), (chunk) => {
      if (state.draft.run !== run) return;
      state.draft.text += chunk;
      renderLetter();
    });
    if (state.draft.run !== run) return;
    state.draft = { status: 'done', text: finalizeLetter(raw, profile.nombre), run };
  } catch (err) {
    console.warn('[emily] borrador local:', err);
    if (state.draft.run !== run) return;
    state.draft.status = 'failed';
    if (state.view === 'local') state.view = bestVersion();
  }
  renderLetter();
}

function renderModel() {
  const card = $('#modelo');
  const m = state.model;
  // Once the model is on the device the card is no longer needed: the letter switcher offers it.
  card.hidden = m.phase === 'ready' || (m.cached && m.phase !== 'failed');
  if (card.hidden) return;
  const desc = $('#model-desc');
  const btn = $<HTMLButtonElement>('#model-load');
  const size = gb(LOCAL_MODEL.approxBytes);
  $('#model-progress').hidden = m.phase !== 'loading';
  if (m.phase === 'loading') {
    const pct = m.total ? Math.round((m.loaded / m.total) * 100) : 0;
    $<HTMLProgressElement>('#model-bar').value = pct;
    $('#model-bytes').textContent = `${gb(m.loaded)} de ${gb(m.total)}`;
    desc.textContent = 'Descargando. Podés seguir usando la app mientras tanto.';
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.disabled = false;
  if (m.phase === 'failed') {
    desc.textContent = 'No se pudo completar la descarga. Revisá tu conexión e intentá de nuevo.';
    btn.textContent = 'Intentar de nuevo';
    return;
  }
  if (m.webgpu === false) {
    desc.textContent =
      'En este navegador la versión sin internet sería muy lenta. Funciona mejor en Chrome o Edge, en una computadora.';
    btn.textContent = `Descargar de todos modos (${size})`;
    return;
  }
  desc.textContent = `Descargá una versión privada que escribe la carta en tu dispositivo, incluso sin conexión. Son ${size}, una sola vez; mejor con Wi-Fi.`;
  btn.textContent = `Descargar (${size})`;
}

$('#model-load').addEventListener('click', async () => {
  const ok = await ensureModel();
  if (ok && state.profile) {
    state.view = 'local';
    state.userPicked = true;
    await writeLocalDraft();
  }
});

async function detectWebGpu(): Promise<boolean> {
  if (TEST_MODE) return true;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function parseAmount(raw: string): number {
  const s = raw.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  // "15,000" / "15.000" / "15000" / "15,000.50"
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (lastSep >= 0 && s.length - lastSep - 1 === 3) return Number(s.replace(/[.,]/g, ''));
  if (lastSep >= 0) return Number(s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1));
  return Number(s);
}

const REQUIRED: [name: string, label: string][] = [
  ['nombre', 'tu nombre'],
  ['puestoActual', 'tu puesto actual'],
  ['aniosExperiencia', 'años de experiencia'],
  ['empleadorActual', 'dónde trabajás hoy'],
  ['puestoDeseado', 'el puesto que buscás'],
  ['empresaDestino', 'la empresa'],
  ['logros', 'tus logros'],
  ['salarioActual', 'cuánto ganás hoy'],
  ['salarioDeseado', 'cuánto querés ganar'],
];

function readProfile(): { profile?: Profile; missing: (typeof REQUIRED)[number][] } {
  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? '').trim();
  const salarioActual = parseAmount(get('salarioActual'));
  const salarioDeseado = parseAmount(get('salarioDeseado'));
  const anios = Number(get('aniosExperiencia'));
  const invalid = new Set<string>();
  for (const [k] of REQUIRED) if (!get(k)) invalid.add(k);
  if (!(salarioActual > 0)) invalid.add('salarioActual');
  if (!(salarioDeseado > 0)) invalid.add('salarioDeseado');
  if (!Number.isFinite(anios) || anios < 0) invalid.add('aniosExperiencia');

  for (const [k] of REQUIRED) {
    const el = form.elements.namedItem(k) as HTMLInputElement;
    if (invalid.has(k)) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
  const missing = REQUIRED.filter(([k]) => invalid.has(k));
  if (missing.length) return { missing };
  return {
    missing,
    profile: {
      nombre: get('nombre'),
      puestoActual: get('puestoActual'),
      empleadorActual: get('empleadorActual'),
      salarioActual,
      monedaActual: get('monedaActual') as Currency,
      puestoDeseado: get('puestoDeseado'),
      empresaDestino: get('empresaDestino'),
      salarioDeseado,
      monedaDeseada: get('monedaDeseada') as Currency,
      aniosExperiencia: Math.round(anios),
      logros: get('logros'),
      oferta: get('oferta') || undefined,
    },
  };
}

function renderPreview() {
  document.querySelectorAll<HTMLElement>('[data-bind]').forEach((el) => {
    const field = form.elements.namedItem(el.dataset.bind!) as HTMLInputElement | null;
    const v = field?.value.trim() ?? '';
    el.textContent = v || el.dataset.empty || '';
    el.classList.toggle('is-empty', !v);
  });
}

function fillForm(p: Profile) {
  (Object.keys(p) as (keyof Profile)[]).forEach((k) => {
    const el = form.elements.namedItem(k) as HTMLInputElement | null;
    if (el) el.value = p[k] === undefined ? '' : String(p[k]);
    el?.removeAttribute('aria-invalid');
  });
  if (p.oferta) $<HTMLDetailsElement>('#oferta-box').open = true;
  $('#form-error').hidden = true;
  renderPreview();
}

$('#ejemplo').addEventListener('click', () => fillForm(EXAMPLE_PROFILE));

form.addEventListener('input', (e) => {
  (e.target as HTMLElement).removeAttribute('aria-invalid');
  renderPreview();
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const { profile, missing } = readProfile();
  const errEl = $('#form-error');
  if (!profile) {
    errEl.hidden = false;
    errEl.textContent = `Te falta completar: ${missing.map(([, label]) => label).join(', ')}.`;
    (form.elements.namedItem(missing[0][0]) as HTMLElement).focus();
    return;
  }
  errEl.hidden = true;

  const run = ++state.run;
  const online = navigator.onLine;
  const deviceOnly = (form.elements.namedItem('soloDispositivo') as HTMLInputElement).checked;
  const useCloud = !deviceOnly && isFirebaseConfigured();

  state.profile = profile;
  state.base = { note: buildNegotiationNote(profile), template: buildTemplateLetter(profile) };
  state.result = null;
  state.draft = { status: 'none', text: '', run };
  state.userPicked = false;
  state.cloudPending = useCloud && online;
  state.view = state.cloudPending ? 'nube' : bestVersion();

  history.pushState({ step: 'carta' }, '');
  renderAll();
  showStep('carta');
  if (state.view === 'local') void writeLocalDraft();

  const result = await generateAll(profile, { online, useCloud });
  if (run !== state.run) return;
  if (result.cloudStatus === 'error') console.warn('[emily] versión en línea:', result.cloudError);
  state.result = result;
  state.cloudPending = false;
  if (!state.userPicked || (state.view === 'nube' && result.cloudStatus !== 'sent')) {
    state.view = bestVersion();
    if (state.view === 'local') void writeLocalDraft();
  }
  renderLetter();
});

// ---------------------------------------------------------------------------
// Letter
// ---------------------------------------------------------------------------

function availableVersions(): Version[] {
  const v: Version[] = [];
  if (state.cloudPending || state.result?.cloudStatus === 'sent') v.push('nube');
  const d = state.draft.status;
  if (d === 'writing' || d === 'done' || (d === 'none' && modelAvailable())) v.push('local');
  v.push('plantilla');
  return v;
}

function bestVersion(): Version {
  if (state.result?.cloudStatus === 'sent') return 'nube';
  if (state.draft.status !== 'failed' && (state.draft.status !== 'none' || modelAvailable())) return 'local';
  return 'plantilla';
}

function currentText(): string | null {
  if (state.view === 'nube') return state.result?.cloudLetter?.finalText ?? null;
  if (state.view === 'local') return state.draft.status === 'done' ? state.draft.text : null;
  return state.base?.template ?? null;
}

const SENSITIVE_PLAIN: Record<SensitiveType, string> = {
  salary: 'una cifra de tu salario',
  employer: 'dónde trabajás hoy',
  person_name: 'el nombre de otra persona',
  phone: 'un número de teléfono',
  email: 'un correo',
  dpi: 'un DPI',
  address: 'una dirección',
  nit: 'un NIT',
};

function noticeText(): string {
  const r = state.result;
  const fallback = state.view === 'local' ? 'la versión de tu dispositivo' : 'la versión base';
  if (r?.cloudStatus === 'blocked') {
    const what = SENSITIVE_PLAIN[r.route.residual[0]?.type ?? 'salary'];
    return `Como tu texto menciona ${what}, te dejamos ${fallback}. Si quitás ese dato, podés pedir la versión en línea.`;
  }
  if (r?.cloudStatus === 'error') return `No pudimos generar la versión en línea; te dejamos ${fallback}.`;
  if (state.draft.status === 'failed' && state.view !== 'nube')
    return 'No pudimos escribir la versión de tu dispositivo; te dejamos la versión base.';
  return '';
}

function letterHtml(text: string, testid: string, writing = false): string {
  return `<div class="letter" data-testid="${testid}"><div class="letter__text${writing ? ' is-writing' : ''}">${esc(text)}</div></div>`;
}

function writingHtml(message: string, testid: string): string {
  return `<div class="writing" data-testid="${testid}"><p>${esc(message)}</p><div class="writing__lines" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div>`;
}

function renderLetter() {
  if (!state.base || !state.profile) return;
  const versions = availableVersions();
  if (!versions.includes(state.view)) state.view = versions[0];

  $('#results-title').textContent = `Tu carta para ${state.profile.empresaDestino}`;

  // version switcher: only when there is more than one letter to choose from
  const box = $('#versions');
  box.hidden = versions.length < 2;
  box.querySelectorAll<HTMLLabelElement>('label[data-version]').forEach((label) => {
    const v = label.dataset.version as Version;
    label.hidden = !versions.includes(v);
    label.querySelector('input')!.checked = v === state.view;
  });

  const notice = noticeText();
  $('#letter-notice').hidden = !notice;
  $('#letter-notice').textContent = notice;

  const sheet = $('#hoja');
  let busy = false;
  if (state.view === 'nube') {
    if (state.cloudPending) {
      busy = true;
      sheet.innerHTML = writingHtml('Escribiendo tu carta…', 'letter-pending');
    } else sheet.innerHTML = letterHtml(state.result!.cloudLetter!.finalText, 'letter-cloud');
  } else if (state.view === 'local') {
    const d = state.draft;
    if (d.status === 'done') sheet.innerHTML = letterHtml(d.text, 'letter-local');
    else {
      busy = true;
      sheet.innerHTML = d.text
        ? letterHtml(d.text, 'letter-local', true)
        : writingHtml(
            state.model.phase === 'loading' && !state.model.cached
              ? 'Descargando la versión de tu dispositivo…'
              : 'Escribiendo tu carta en este dispositivo…',
            'letter-local-pending',
          );
    }
  } else sheet.innerHTML = letterHtml(state.base.template, 'letter-template');
  sheet.setAttribute('aria-busy', String(busy));
  sheet.dataset.view = state.view;

  $<HTMLButtonElement>('#copiar').disabled = !currentText();
}

$('#versions').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  state.view = input.value as Version;
  state.userPicked = true;
  if (state.view === 'local' && state.draft.status === 'none') void writeLocalDraft();
  renderLetter();
});

$('#copiar').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#copiar');
  const text = currentText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copiada';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => (btn.textContent = 'Copiar carta'), 2000);
});

// ---------------------------------------------------------------------------
// Private negotiation note
// ---------------------------------------------------------------------------

function renderNote() {
  const p = state.profile;
  const n = state.base?.note;
  if (!p || !n) return;
  const money = (v: number, c: Currency) => formatMoney(v, c);
  // keep "25 %–40 %" together: no break before "%" or around a dash between numbers
  const nbsp = (t: string) => t.replace(/ %/g, '\u00a0%').replace(/%–(\d)/g, '%\u2060–\u2060$1');
  const pct = `${Math.abs(n.gapPct).toFixed(1)}\u00a0%`;
  const change =
    Math.abs(n.gapPct) < 0.05
      ? 'Pedís lo mismo que ganás hoy'
      : `Pedís ${pct} ${n.gapPct > 0 ? 'más' : 'menos'} que hoy`;
  const facts = [
    `<div><dt>Rango para pedir</dt><dd>${esc(`${money(n.suggestedRange.min, n.suggestedRange.currency)} – ${money(n.suggestedRange.max, n.suggestedRange.currency)}`)}</dd></div>`,
  ];
  if (n.offerRange) {
    const o = n.offerRange;
    facts.push(`<div><dt>La oferta publica</dt><dd>${esc(`${money(o.min, o.currency)}${o.max !== o.min ? ` – ${money(o.max, o.currency)}` : ''}`)}</dd></div>`);
  }
  // The first "when to mention" rule ("no salary figures in the letter") is already enforced
  // by the app itself, so the note shows the advice plus the timing rules.
  const tips = [...n.advice, ...n.whenToMention.slice(1)].slice(0, 4);
  $('#nota-body').innerHTML = `
    <p class="verdict" data-band="${n.band.id}">${esc(n.band.label)}</p>
    <p class="verdict__sub">${esc(change)}: de ${esc(money(p.salarioActual, p.monedaActual))} a ${esc(money(p.salarioDeseado, p.monedaDeseada))}.</p>
    <dl class="facts">${facts.join('')}</dl>
    <ul class="tips">${tips.map((t) => `<li>${esc(nbsp(t))}</li>`).join('')}</ul>`;
}

function renderAll() {
  renderNetwork();
  renderModel();
  renderLetter();
  renderNote();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

void isModelCached().then((cached) => {
  state.model.cached = cached;
  renderModel();
  renderLetter();
});
void detectWebGpu().then((ok) => {
  state.model.webgpu = ok;
  renderModel();
});
history.replaceState({ step: 'datos' }, '');
showStep('datos', false);
renderPreview();
renderAll();
