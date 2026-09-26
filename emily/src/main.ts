import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

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
import { formatAmountInput, formatIntegerInput, groupThousands, letterFileName } from './ui/format';
// Con registerType 'autoUpdate', esto recarga la página en cuanto el service worker nuevo toma el
// control: quien ya visitó la app no se queda con una versión vieja en caché.
registerSW({ immediate: true });

/**
 * UI. Two steps: "tus datos" (form) → "tu carta" (one letter + private note).
 * The letter shown by default is the best one available: online (cloud) → on this device (local
 * model, if downloaded) → base (template). How the cloud request is built and gated lives in
 * src/lib/router.ts; the UI deliberately does not surface it (see README §8).
 */

type Version = 'nube' | 'local' | 'plantilla';

const TEST_MODE = import.meta.env.VITE_TEST_MODE === '1';
const LOG = '[sobre]';
const TITLE = 'Sobre · Tu carta de interés, lista para enviar';
/** After this long, the "writing" state offers the base letter instead of just waiting. */
const SLOW_MS = 30_000;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const form = $<HTMLFormElement>('#perfil');
const submitBtn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;

const state: {
  profile: Profile | null;
  base: { note: NegotiationNote; template: string } | null;
  result: GenerateResult | null;
  useCloud: boolean;
  cloudPending: boolean;
  cloudSince: number;
  cloudAttempt: number;
  run: number;
  view: Version;
  userPicked: boolean;
  model: { phase: 'idle' | 'loading' | 'ready' | 'failed'; cached: boolean; webgpu: boolean | null; loaded: number; total: number };
  draft: { status: 'none' | 'writing' | 'done' | 'failed'; text: string; run: number };
} = {
  profile: null,
  base: null,
  result: null,
  useCloud: false,
  cloudPending: false,
  cloudSince: 0,
  cloudAttempt: 0,
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
// Toast
// ---------------------------------------------------------------------------

let toastTimer: number | undefined;
const CHECK_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>';

function toast(message: string, ok = true) {
  const el = $('#toast');
  el.innerHTML = `${ok ? CHECK_ICON : ''}<span>${esc(message)}</span>`;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('is-visible');
    toastTimer = window.setTimeout(() => (el.innerHTML = ''), 300);
  }, 2400);
}

// ---------------------------------------------------------------------------
// Steps (form → results), with browser back support
// ---------------------------------------------------------------------------

function showStep(step: 'datos' | 'carta', focus = true) {
  const results = step === 'carta';
  $('#paso-datos').hidden = results;
  $('#paso-carta').hidden = !results;
  $('#editar').hidden = !results;
  document.body.dataset.step = step;
  document.title = results && state.profile ? `Tu carta para ${state.profile.empresaDestino} · Sobre` : TITLE;
  window.scrollTo({ top: 0 });
  if (!focus) return;
  if (results) $('#results-title').focus({ preventScroll: true });
  else $('#intake-title').focus({ preventScroll: true });
}

function backToForm() {
  if (history.state?.step === 'carta') history.back();
  else showStep('datos');
}

$('#editar').addEventListener('click', backToForm);

// The logo goes "home": with a letter on screen that means the form, not a reload that loses it.
$('.brand').addEventListener('click', (e) => {
  if (!state.base || document.body.dataset.step === 'perdida') return;
  e.preventDefault();
  if (document.body.dataset.step === 'carta') backToForm();
});

window.addEventListener('popstate', (e) => {
  if (document.body.dataset.step === 'perdida') return;
  showStep(e.state?.step === 'carta' && state.base ? 'carta' : 'datos');
});

/** Unknown paths (e.g. served by the service worker's navigation fallback) get a friendly 404. */
function isKnownPath(): boolean {
  return ['/', '/index.html'].includes(location.pathname);
}

function showNotFound() {
  $('#paso-datos').hidden = true;
  $('#paso-carta').hidden = true;
  $('#no-encontrado').hidden = false;
  document.body.dataset.step = 'perdida';
  document.title = 'Página no encontrada · Sobre';
}

// ---------------------------------------------------------------------------
// Offline banner
// ---------------------------------------------------------------------------

function renderNetwork() {
  $('#offline').hidden = navigator.onLine;
}
window.addEventListener('online', () => {
  renderNetwork();
  renderLetter();
});
window.addEventListener('offline', () => {
  renderNetwork();
  renderLetter();
});

// ---------------------------------------------------------------------------
// Privacy explainer
// ---------------------------------------------------------------------------

const privacy = $<HTMLDialogElement>('#dlg-privacidad');
$('#privacidad').addEventListener('click', () => privacy.showModal());
privacy.addEventListener('click', (e) => {
  // a click on the backdrop (outside the content) closes it
  if (e.target === privacy) privacy.close();
});

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
      console.warn(LOG, 'modelo local:', err);
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
    console.warn(LOG, 'borrador local:', err);
    if (state.draft.run !== run) return;
    state.draft.status = 'failed';
    if (state.view === 'local') state.view = bestVersion();
  }
  renderLetter();
}

function renderModel() {
  const box = $('#modelo');
  const m = state.model;
  // Once the model is on the device the line is no longer needed: the letter switcher offers it.
  box.hidden = m.phase === 'ready' || (m.cached && m.phase !== 'failed');
  if (box.hidden) return;
  const hint = $('#model-hint');
  const btn = $<HTMLButtonElement>('#model-load');
  const size = gb(LOCAL_MODEL.approxBytes);
  box.dataset.phase = m.phase;
  $('#model-progress').hidden = m.phase !== 'loading';
  if (m.phase === 'loading') {
    const pct = m.total ? Math.min(100, Math.round((m.loaded / m.total) * 100)) : 0;
    $<HTMLProgressElement>('#model-bar').value = pct;
    $('#model-bytes').textContent = `${gb(m.loaded)} de ${gb(m.total)} · ${pct} %`;
    hint.textContent = 'Descargando para usar sin internet. Puedes seguir usando la app.';
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.disabled = false;
  if (m.phase === 'failed') {
    hint.textContent = 'No se pudo completar la descarga.';
    btn.textContent = 'Intentar de nuevo';
    return;
  }
  btn.textContent = `Usar sin internet (${size})`;
  hint.textContent = m.webgpu === false ? 'En este navegador sería lenta; va mejor en Chrome o Edge.' : '';
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

type FieldName = 'puestoDeseado' | 'empresaDestino' | 'salarioActual' | 'salarioDeseado' | 'aniosExperiencia';

/** The five visible fields; everything under "Más detalles" is optional. */
const REQUIRED: { name: FieldName; empty: string; invalid?: string; check?: (v: string) => boolean }[] = [
  { name: 'puestoDeseado', empty: 'Escribe el puesto al que aplicas.' },
  { name: 'empresaDestino', empty: 'Escribe el nombre de la empresa.' },
  {
    name: 'salarioActual',
    empty: 'Escribe tu salario actual.',
    invalid: 'Escribe una cantidad mayor que cero.',
    check: (v) => parseAmount(v) > 0,
  },
  {
    name: 'salarioDeseado',
    empty: 'Escribe el salario que quieres.',
    invalid: 'Escribe una cantidad mayor que cero.',
    check: (v) => parseAmount(v) > 0,
  },
  {
    name: 'aniosExperiencia',
    empty: 'Escribe tus años de experiencia (0 si recién empiezas).',
    invalid: 'Escribe un número de años, por ejemplo 3.',
    check: (v) => /^\d{1,2}$/.test(v),
  },
];

const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

/** Validate one field and show (or clear) its inline message. Returns the message, if any. */
function validateField(rule: (typeof REQUIRED)[number], show = true): string {
  const el = input(rule.name);
  const v = el.value.trim();
  const message = !v ? rule.empty : rule.check && !rule.check(v) ? rule.invalid! : '';
  if (!show) return message;
  const err = $(`#e-${rule.name}`);
  err.textContent = message;
  err.hidden = !message;
  if (message) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
  return message;
}

function readProfile(): { profile?: Profile; invalid: FieldName[] } {
  const invalid = REQUIRED.filter((r) => validateField(r)).map((r) => r.name);
  if (invalid.length) return { invalid };
  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    invalid,
    profile: {
      nombre: get('nombre'),
      puestoActual: get('puestoActual'),
      empleadorActual: get('empleadorActual'),
      salarioActual: parseAmount(get('salarioActual')),
      monedaActual: get('monedaActual') as Currency,
      puestoDeseado: get('puestoDeseado'),
      empresaDestino: get('empresaDestino'),
      salarioDeseado: parseAmount(get('salarioDeseado')),
      monedaDeseada: get('monedaDeseada') as Currency,
      aniosExperiencia: Math.round(Number(get('aniosExperiencia'))),
      logros: get('logros'),
      oferta: get('oferta') || undefined,
    },
  };
}

function fillForm(p: Profile) {
  (Object.keys(p) as (keyof Profile)[]).forEach((k) => {
    const el = form.elements.namedItem(k) as HTMLInputElement | null;
    if (!el) return;
    const v = p[k] === undefined ? '' : String(p[k]);
    el.value = k === 'salarioActual' || k === 'salarioDeseado' ? groupThousands(v) : v;
  });
  for (const r of REQUIRED) validateField(r);
  $('#form-error').hidden = true;
}

$('#ejemplo').addEventListener('click', () => fillForm(EXAMPLE_PROFILE));

// Money formatted as you type; years digits only. Errors clear as soon as the value is fixed.
form.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.name === 'salarioActual' || el.name === 'salarioDeseado') {
    const pasted = (e as InputEvent).inputType === 'insertFromPaste';
    const { value, caret } = formatAmountInput(el.value, el.selectionStart ?? el.value.length, { pasted });
    if (value !== el.value) {
      el.value = value;
      if (document.activeElement === el) el.setSelectionRange(caret, caret);
    }
  } else if (el.name === 'aniosExperiencia') {
    const v = formatIntegerInput(el.value);
    if (v !== el.value) el.value = v;
  }
  const rule = REQUIRED.find((r) => r.name === el.name);
  if (rule && el.getAttribute('aria-invalid') === 'true') validateField(rule);
  if (!$('#form-error').hidden && REQUIRED.every((r) => !validateField(r, false))) $('#form-error').hidden = true;
});

// Inline validation on leaving a field, only once the person has written something.
form.addEventListener('focusout', (e) => {
  const el = e.target as HTMLInputElement;
  const rule = REQUIRED.find((r) => r.name === el.name);
  if (rule && el.value.trim()) validateField(rule);
});

// Enter: submit when everything is there; otherwise jump to the next missing field.
form.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const el = e.target as HTMLElement;
  if (el instanceof HTMLTextAreaElement) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      form.requestSubmit();
    }
    return;
  }
  if (!(el instanceof HTMLInputElement) || el.type === 'checkbox') return;
  const current = REQUIRED.find((r) => r.name === el.name);
  const currentOk = !current || !validateField(current, false);
  const missing = REQUIRED.find((r) => r.name !== el.name && validateField(r, false));
  if (missing && currentOk) {
    e.preventDefault();
    input(missing.name).focus();
  }
});

function setSubmitting(busy: boolean) {
  submitBtn.disabled = busy;
  submitBtn.setAttribute('aria-busy', String(busy));
  submitBtn.querySelector('.btn__label')!.textContent = busy ? 'Preparando…' : 'Preparar carta y nota';
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (submitBtn.disabled) return;
  const { profile, invalid } = readProfile();
  const errEl = $('#form-error');
  if (!profile) {
    errEl.hidden = false;
    errEl.textContent =
      invalid.length === 1 ? 'Falta un dato para preparar tu carta.' : `Faltan ${invalid.length} datos para preparar tu carta.`;
    input(invalid[0]).focus();
    return;
  }
  errEl.hidden = true;
  setSubmitting(true);

  const run = ++state.run;
  const deviceOnly = (form.elements.namedItem('soloDispositivo') as HTMLInputElement).checked;
  state.useCloud = !deviceOnly && isFirebaseConfigured();
  state.profile = profile;
  state.base = { note: buildNegotiationNote(profile), template: buildTemplateLetter(profile) };
  state.result = null;
  state.draft = { status: 'none', text: '', run };
  state.userPicked = false;
  state.cloudPending = state.useCloud && navigator.onLine;
  state.view = state.cloudPending ? 'nube' : bestVersion();

  history.pushState({ step: 'carta' }, '');
  renderAll();
  showStep('carta');
  requestAnimationFrame(() => setSubmitting(false));
  if (state.view === 'local') void writeLocalDraft();
  void requestCloud(profile);
});

/** Ask for the online version (or record why it was not asked). Safe to call again to retry. */
async function requestCloud(profile: Profile) {
  const run = state.run;
  const attempt = ++state.cloudAttempt;
  const online = navigator.onLine;
  state.cloudPending = state.useCloud && online;
  state.cloudSince = Date.now();
  if (state.cloudPending) {
    window.setTimeout(() => {
      if (attempt === state.cloudAttempt && state.cloudPending) renderLetter();
    }, SLOW_MS + 50);
  }
  renderLetter();

  const result = await generateAll(profile, { online, useCloud: state.useCloud });
  if (run !== state.run || attempt !== state.cloudAttempt) return;
  if (result.cloudStatus === 'error') console.warn(LOG, 'versión en línea:', result.cloudError);
  state.result = result;
  state.cloudPending = false;
  if (!state.userPicked || (state.view === 'nube' && result.cloudStatus !== 'sent')) {
    state.view = bestVersion();
    if (state.view === 'local') void writeLocalDraft();
  } else if (result.cloudStatus === 'sent' && state.view !== 'nube') {
    toast('Tu carta en línea está lista');
  }
  renderLetter();
}

function retryCloud() {
  if (!state.profile) return;
  if (!navigator.onLine) {
    toast('Sin conexión. Inténtalo cuando vuelvas a tener internet.', false);
    return;
  }
  state.result = null;
  state.userPicked = false;
  state.view = 'nube';
  void requestCloud(state.profile);
}

/** Back to the form with "Más detalles" open, on the field that holds what blocked the letter. */
function reviewSensitive() {
  const r = state.result;
  const hit = r?.route.residual[0]?.match?.toLowerCase() ?? '';
  const fields = ['logros', 'oferta', 'puestoActual'];
  const field =
    fields.find((f) => hit && input(f)?.value.toLowerCase().includes(hit)) ?? 'logros';
  backToForm();
  ($('#mas-detalles') as HTMLDetailsElement).open = true;
  requestAnimationFrame(() => input(field).focus());
}

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
  employer: 'dónde trabajas hoy',
  person_name: 'el nombre de otra persona',
  phone: 'un número de teléfono',
  email: 'un correo',
  dpi: 'un DPI',
  address: 'una dirección',
  nit: 'un NIT',
};

interface Notice {
  text: string;
  action?: { label: string; run: () => void };
}

function notice(): Notice | null {
  const r = state.result;
  const fallback = state.view === 'local' ? 'la versión de tu dispositivo' : 'la versión base';
  if (r?.cloudStatus === 'blocked') {
    const what = SENSITIVE_PLAIN[r.route.residual[0]?.type ?? 'salary'];
    return {
      text: `Como tu texto menciona ${what}, te dejamos ${fallback}. Si quitas ese dato, puedes pedir la versión en línea.`,
      action: { label: 'Revisar mis datos', run: reviewSensitive },
    };
  }
  if (r?.cloudStatus === 'error' && state.view !== 'nube') {
    return {
      text: `No pudimos escribir la versión en línea esta vez. Te dejamos ${fallback}.`,
      action: { label: 'Intentar de nuevo', run: retryCloud },
    };
  }
  if (r?.cloudStatus === 'offline' && state.useCloud && navigator.onLine && state.view !== 'nube') {
    return { text: 'Ya tienes conexión de nuevo.', action: { label: 'Pedir la versión en línea', run: retryCloud } };
  }
  if (state.draft.status === 'failed' && state.view !== 'nube') {
    return {
      text: 'No pudimos escribir la versión de tu dispositivo; te dejamos la versión base.',
      action: {
        label: 'Intentar de nuevo',
        run: () => {
          state.draft = { status: 'none', text: '', run: state.run };
          state.view = 'local';
          state.userPicked = true;
          void writeLocalDraft();
        },
      },
    };
  }
  return null;
}

let noticeAction: (() => void) | null = null;
$('#notice-action').addEventListener('click', () => noticeAction?.());

function letterHtml(text: string, testid: string, writing = false): string {
  return `<div class="letter" data-testid="${testid}"><div class="letter__text${writing ? ' is-writing' : ''}">${esc(text)}</div></div>`;
}

/** Widths of the skeleton lines: greeting, three paragraphs, closing and signature. */
const SKELETON = [44, 0, 100, 97, 99, 62, 0, 100, 95, 98, 99, 41, 0, 100, 73, 0, 26, 38];

function writingHtml(message: string, testid: string, slow = false): string {
  const lines = SKELETON.map((w) => (w ? `<span style="width:${w}%"></span>` : '<span class="gap"></span>')).join('');
  const slowHtml = slow
    ? `<div class="writing__slow"><p>Está tardando más de lo normal.</p><button type="button" class="link-btn" data-action="show-base" data-testid="show-base">Ver la versión base mientras tanto</button></div>`
    : '';
  // On a phone the note sits below the letter: say it is already there, to use the wait.
  const noteHint = `<p class="writing__note"><a href="#nota" data-action="to-note">Mientras tanto, tu nota privada ya está lista.</a></p>`;
  return `<div class="writing" data-testid="${testid}"><p class="writing__status">${esc(message)}</p>${slowHtml}${noteHint}<div class="skeleton" aria-hidden="true">${lines}</div></div>`;
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

  const n = notice();
  $('#letter-notice-box').hidden = !n;
  $('#letter-notice').textContent = n?.text ?? '';
  const actionBtn = $('#notice-action');
  actionBtn.hidden = !n?.action;
  actionBtn.textContent = n?.action?.label ?? '';
  noticeAction = n?.action?.run ?? null;

  const sheet = $('#hoja');
  let busy = false;
  let html: string;
  if (state.view === 'nube') {
    if (state.cloudPending) {
      busy = true;
      const slow = Date.now() - state.cloudSince > SLOW_MS;
      html = writingHtml('Escribiendo tu carta. Suele tardar menos de un minuto.', 'letter-pending', slow);
    } else html = letterHtml(state.result!.cloudLetter!.finalText, 'letter-cloud');
  } else if (state.view === 'local') {
    const d = state.draft;
    if (d.status === 'done') html = letterHtml(d.text, 'letter-local');
    else {
      busy = true;
      html = d.text
        ? letterHtml(d.text, 'letter-local', true)
        : writingHtml(
            state.model.phase === 'loading' && !state.model.cached
              ? 'Descargando lo necesario para escribir sin internet…'
              : state.model.webgpu === false
                ? 'Escribiendo tu carta en este dispositivo. Puede tardar unos minutos.'
                : 'Escribiendo tu carta en este dispositivo. Suele tardar menos de un minuto.',
            'letter-local-pending',
          );
    }
  } else html = letterHtml(state.base.template, 'letter-template');
  // Re-render only on change, so the entrance animation plays once per letter.
  if (sheet.dataset.html !== html) {
    sheet.innerHTML = html;
    sheet.dataset.html = html;
  }
  sheet.setAttribute('aria-busy', String(busy));
  sheet.dataset.view = state.view;

  const ready = Boolean(currentText());
  $('.letter-actions').dataset.ready = String(ready);
  $<HTMLButtonElement>('#copiar').disabled = !ready;
  $<HTMLButtonElement>('#descargar').disabled = !ready;
}

$('#hoja').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-action="to-note"]')) {
    e.preventDefault();
    $('#nota').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('#nota-title').focus({ preventScroll: true });
    return;
  }
  if ((e.target as HTMLElement).closest('[data-action="show-base"]')) {
    state.view = 'plantilla';
    state.userPicked = true;
    renderLetter();
  }
});

$('#versions').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  state.view = el.value as Version;
  state.userPicked = true;
  if (state.view === 'local' && state.draft.status === 'none') void writeLocalDraft();
  renderLetter();
});

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older or locked-down browsers: copy through a temporary, off-screen text area.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

$('#copiar').addEventListener('click', async () => {
  const text = currentText();
  if (!text) return;
  if (await copyText(text)) toast('Copiada');
  else toast('No se pudo copiar. Selecciona el texto y cópialo a mano.', false);
});

$('#descargar').addEventListener('click', () => {
  const text = currentText();
  if (!text || !state.profile) return;
  const url = URL.createObjectURL(new Blob([text.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = letterFileName(state.profile.empresaDestino);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Descargada');
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
  // …and typographic quotes
  const nbsp = (t: string) =>
    t
      .replace(/ %/g, '\u00a0%')
      .replace(/%–(\d)/g, '%\u2060–\u2060$1')
      .replace(/"([^"]*)"/g, '\u201c$1\u201d');
  const pct = `${Math.abs(n.gapPct).toFixed(1)}\u00a0%`;
  const change =
    Math.abs(n.gapPct) < 0.05
      ? 'Pides lo mismo que ganas hoy'
      : `Pides ${pct} ${n.gapPct > 0 ? 'más' : 'menos'} que hoy`;
  const range = `${money(n.suggestedRange.min, n.suggestedRange.currency)} – ${money(n.suggestedRange.max, n.suggestedRange.currency)}`;
  // The first "when to mention" rule ("no salary figures in the letter") is already enforced
  // by the app itself, so the note shows the advice plus the timing rules: two up front (the
  // advice already cites the offer's range when there is one), the rest under "Ver más".
  const tips = [...n.advice, ...n.whenToMention.slice(1)].map(nbsp);
  const shown = tips.slice(0, 2);
  const more = tips.slice(2);
  const list = (items: string[]) => `<ul class="tips">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  $('#nota-body').innerHTML = `
    <p class="verdict" data-band="${n.band.id}">${esc(n.band.label)}</p>
    <p class="verdict__sub">${esc(change)}: de ${esc(money(p.salarioActual, p.monedaActual))} a ${esc(money(p.salarioDeseado, p.monedaDeseada))}.</p>
    <p class="range"><span>Rango para pedir</span> <strong>${esc(range)}</strong></p>
    ${list(shown)}
    ${more.length ? `<details class="more more--note"><summary>Ver más</summary><div class="more__body">${list(more)}</div></details>` : ''}`;
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
renderNetwork();
if (!isKnownPath()) {
  showNotFound();
} else {
  history.replaceState({ step: 'datos' }, '');
  showStep('datos', false);
  renderAll();
}
