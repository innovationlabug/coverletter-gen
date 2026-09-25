import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';

import { isFirebaseConfigured } from './firebase-config';
import { appCheckMode } from './lib/firebase';
import { checkLetter, CRITERIA } from './lib/letter-checks';
import { createLocalLlm, isModelCached } from './lib/local-llm-client';
import { LOCAL_MODEL } from './lib/local-model-meta';
import { formatMoney } from './lib/money';
import { generateAll, type GenerateResult } from './lib/orchestrator';
import { buildLetterPrompt, finalizeLetter, localLetterInput } from './lib/prompt';
import { TAGS } from './lib/redact';
import { LOCAL_ONLY_FIELDS } from './lib/router';
import { wordCount } from './lib/text';
import type { Currency, Profile, SensitiveType } from './lib/types';
import { EXAMPLE_PROFILE } from './ui/example';

type View = 'local' | 'nube' | 'plantilla' | 'comparar';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const form = $<HTMLFormElement>('#perfil');

const state: {
  profile: Profile | null;
  result: GenerateResult | null;
  local: { status: 'idle' | 'loading' | 'ready' | 'writing' | 'done' | 'error'; text: string; error?: string; ms?: number; device?: string };
  modelCached: boolean;
  view: View;
} = {
  profile: null,
  result: null,
  local: { status: 'idle', text: '' },
  modelCached: false,
  view: 'plantilla',
};

const TYPE_LABEL: Record<SensitiveType, string> = {
  salary: 'Monto de dinero',
  employer: 'Empleador actual',
  person_name: 'Nombre de persona',
  phone: 'Teléfono',
  email: 'Correo',
  dpi: 'DPI',
  address: 'Dirección',
  nit: 'NIT',
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

// ---------------------------------------------------------------------------
// Status strip
// ---------------------------------------------------------------------------

function renderStatus() {
  const online = navigator.onLine;
  $('#st-red').textContent = online ? 'Con conexión' : 'Sin conexión: nota y plantilla siguen funcionando';
  $('#st-red').dataset.state = online ? 'ok' : 'off';
  const cfg = isFirebaseConfigured();
  const ac = appCheckMode();
  $('#st-nube').textContent = !cfg
    ? 'Nube sin configurar'
    : ac === 'off'
      ? 'Nube: Gemini (sin App Check)'
      : ac === 'debug-token'
        ? 'Nube: Gemini (App Check de desarrollo)'
        : 'Nube: Gemini con App Check';
  $('#st-nube').dataset.state = cfg ? 'ok' : 'off';
  const m = state.local;
  $('#st-modelo').textContent =
    m.status === 'ready' || m.status === 'done' || m.status === 'writing'
      ? `Modelo local listo (${m.device === 'webgpu' ? 'WebGPU' : 'WASM'})`
      : state.modelCached
        ? 'Modelo local descargado'
        : 'Modelo local sin descargar';
  $('#st-modelo').dataset.state = state.modelCached || m.status === 'ready' || m.status === 'done' ? 'ok' : 'off';
}

// ---------------------------------------------------------------------------
// Local model
// ---------------------------------------------------------------------------

const llm = createLocalLlm({
  onEvent(e) {
    if (e.type === 'device') state.local.device = e.device;
    if (e.type === 'progress') {
      $('#model-progress').hidden = false;
      $<HTMLProgressElement>('#model-bar').value = e.progress;
      $('#model-bytes').textContent = `${gb(e.loaded)} de ${gb(e.total)}`;
    }
    if (e.type === 'ready') {
      state.local.device = e.device;
      state.modelCached = true;
      $('#model-progress').hidden = true;
    }
    renderModel();
    renderStatus();
  },
});

function renderModel() {
  const m = state.local;
  const desc = $('#model-desc');
  const btn = $<HTMLButtonElement>('#model-load');
  const size = gb(LOCAL_MODEL.approxBytes);
  if (m.status === 'loading') {
    desc.textContent = state.modelCached
      ? `Cargando ${LOCAL_MODEL.label} desde el caché del navegador…`
      : `Descargando ${LOCAL_MODEL.label} (${size}). Se descarga una sola vez y queda guardado para usarlo sin internet.`;
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    return;
  }
  if (m.status === 'error') {
    desc.textContent = `No se pudo usar el modelo local: ${m.error}. La plantilla y la nota siguen disponibles.`;
    btn.disabled = false;
    btn.textContent = 'Reintentar';
    return;
  }
  if (m.status === 'ready' || m.status === 'writing' || m.status === 'done') {
    desc.textContent = `${LOCAL_MODEL.label} listo en tu dispositivo (${m.device === 'webgpu' ? 'WebGPU' : 'WASM, más lento'}). Recibe tu perfil completo porque nada sale de aquí.`;
    btn.disabled = !state.profile || m.status === 'writing';
    btn.textContent = m.status === 'writing' ? 'Escribiendo…' : 'Escribir borrador local';
    return;
  }
  desc.textContent = state.modelCached
    ? `${LOCAL_MODEL.label} ya está descargado. Funciona sin internet.`
    : `${LOCAL_MODEL.label}: ${size} que se descargan una sola vez. Mejor con Wi-Fi y en una computadora con WebGPU.`;
  btn.disabled = false;
  btn.textContent = state.modelCached ? 'Cargar modelo' : `Descargar modelo (${size})`;
}

async function loadModel(): Promise<boolean> {
  state.local.status = 'loading';
  state.local.error = undefined;
  renderModel();
  try {
    await llm.load();
    state.local.status = 'ready';
  } catch (err) {
    state.local.status = 'error';
    state.local.error = err instanceof Error ? err.message : String(err);
  }
  renderModel();
  renderStatus();
  return state.local.status === 'ready';
}

async function writeLocalDraft() {
  if (!state.profile) return;
  const profile = state.profile;
  state.local.status = 'writing';
  state.local.text = '';
  state.view = 'local';
  renderModel();
  renderLetter();
  const t0 = performance.now();
  try {
    const raw = await llm.generate(buildLetterPrompt(localLetterInput(profile)), (chunk) => {
      state.local.text += chunk;
      renderLetter();
    });
    state.local.text = finalizeLetter(raw, profile.nombre);
    state.local.ms = performance.now() - t0;
    state.local.status = 'done';
  } catch (err) {
    state.local.status = 'error';
    state.local.error = err instanceof Error ? err.message : String(err);
  }
  renderModel();
  renderLetter();
}

$('#model-load').addEventListener('click', async () => {
  if (state.local.status === 'ready' || state.local.status === 'done') return writeLocalDraft();
  const ok = await loadModel();
  if (ok && state.profile) await writeLocalDraft();
});

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

function readProfile(): { profile?: Profile; errors: string[] } {
  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? '').trim();
  const errors: string[] = [];
  const need = (k: string, label: string) => {
    if (!get(k)) errors.push(label);
  };
  need('nombre', 'nombre');
  need('puestoActual', 'puesto actual');
  need('empleadorActual', 'empleador actual');
  need('puestoDeseado', 'puesto deseado');
  need('empresaDestino', 'empresa destino');
  need('logros', 'logros');
  const salarioActual = parseAmount(get('salarioActual'));
  const salarioDeseado = parseAmount(get('salarioDeseado'));
  const anios = Number(get('aniosExperiencia'));
  if (!(salarioActual > 0)) errors.push('salario actual (un número mayor que cero)');
  if (!(salarioDeseado > 0)) errors.push('salario deseado (un número mayor que cero)');
  if (!Number.isFinite(anios) || anios < 0 || get('aniosExperiencia') === '') errors.push('años de experiencia');
  if (errors.length) return { errors };
  return {
    errors,
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

function fillForm(p: Profile) {
  const set = (k: string, v: string | number | undefined) => {
    const el = form.elements.namedItem(k) as HTMLInputElement | null;
    if (el) el.value = v === undefined ? '' : String(v);
  };
  (Object.keys(p) as (keyof Profile)[]).forEach((k) => set(k, p[k] as string | number | undefined));
}

$('#ejemplo').addEventListener('click', () => fillForm(EXAMPLE_PROFILE));

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const { profile, errors } = readProfile();
  const errEl = $('#form-error');
  if (!profile) {
    errEl.hidden = false;
    errEl.textContent = `Falta completar: ${errors.join(', ')}.`;
    return;
  }
  errEl.hidden = true;
  state.profile = profile;
  state.local = { ...state.local, text: '', status: state.local.status === 'done' ? 'ready' : state.local.status };
  const useCloud = (form.elements.namedItem('usarNube') as HTMLInputElement).checked;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  submit.disabled = true;
  submit.textContent = useCloud && navigator.onLine ? 'Preparando… (esperando a la nube)' : 'Preparando…';
  state.result = null;
  renderCloudPending(useCloud);
  const result = await generateAll(profile, { online: navigator.onLine, useCloud: useCloud && isFirebaseConfigured() });
  if (useCloud && !isFirebaseConfigured() && result.cloudStatus === 'skipped') result.cloudError = 'nube sin configurar';
  state.result = result;
  state.view = result.cloudStatus === 'sent' ? 'nube' : 'plantilla';
  submit.disabled = false;
  submit.textContent = 'Preparar carta y nota';
  renderAll();
  if (state.local.status === 'ready') void writeLocalDraft();
  $('#hoja').focus({ preventScroll: false });
});

// ---------------------------------------------------------------------------
// Letter sheet
// ---------------------------------------------------------------------------

document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.view = tab.dataset.view as View;
    renderLetter();
  });
  tab.addEventListener('keydown', (e) => {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]')];
    const i = tabs.indexOf(tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    }
  });
});

function checksHtml(letter: string): string {
  if (!state.profile || !letter.trim()) return '';
  const c = checkLetter(letter, state.profile);
  return `<ul class="checks" aria-label="Revisión automática">${CRITERIA.map(
    (k) => `<li data-pass="${c[k.id].pass}" title="${esc(c[k.id].detail)}"><span aria-hidden="true">${c[k.id].pass ? '✓' : '·'}</span> ${esc(k.label)}<span class="sr">: ${c[k.id].pass ? 'cumple' : 'revisar'} (${esc(c[k.id].detail)})</span></li>`,
  ).join('')}</ul>`;
}

function letterBlock(title: string, text: string, meta: string, testid: string): string {
  return `<div class="letter" data-testid="${testid}">
    <div class="letter__meta"><span>${esc(title)}</span><span>${esc(meta)}</span></div>
    <div class="letter__text">${esc(text)}</div>
    ${checksHtml(text)}
    <button type="button" class="btn btn--quiet copy" data-copy="${testid}">Copiar carta</button>
  </div>`;
}

function localBlock(): string {
  const m = state.local;
  if (m.status === 'writing') return letterBlock('Borrador local', m.text || 'Pensando…', 'escribiendo en tu dispositivo', 'letter-local');
  if (m.status === 'done') return letterBlock('Borrador local', m.text, `${wordCount(m.text)} palabras · ${((m.ms ?? 0) / 1000).toFixed(0)} s en tu dispositivo`, 'letter-local');
  if (m.status === 'error') return `<p class="empty">El modelo local falló: ${esc(m.error ?? '')}. Usá la plantilla o la carta de la nube.</p>`;
  return `<p class="empty">El borrador local necesita el modelo (${gb(LOCAL_MODEL.approxBytes)}). Usá “${state.modelCached ? 'Cargar modelo' : 'Descargar modelo'}” arriba; después se escribe solo.</p>`;
}

function cloudBlock(): string {
  const r = state.result;
  if (!r) return '<p class="empty">Aún no hay carta de la nube.</p>';
  switch (r.cloudStatus) {
    case 'sent':
      return letterBlock('Carta de la nube', r.cloudLetter!.finalText, `${wordCount(r.cloudLetter!.finalText)} palabras · ${(r.cloudLetter!.latencyMs / 1000).toFixed(1)} s · ${r.cloudLetter!.model}`, 'letter-cloud');
    case 'blocked':
      return '<p class="empty">No se envió nada: el control final encontró datos sensibles después del tachado. Revisá “Qué salió a la nube”.</p>';
    case 'offline':
      return '<p class="empty">Sin conexión: no se pidió la carta a la nube. La plantilla y el borrador local siguen disponibles.</p>';
    case 'error':
      return `<p class="empty">La nube respondió con un error: ${esc(r.cloudError ?? '')}</p>${
        /app check/i.test(r.cloudError ?? '')
          ? '<p class="empty">El proyecto de Firebase exige App Check para Gemini. Configurá una clave de reCAPTCHA Enterprise en VITE_RECAPTCHA_ENTERPRISE_KEY (o, en desarrollo, un token de depuración en VITE_APPCHECK_DEBUG_TOKEN). Ver README, sección “Solución de problemas”. Mientras tanto, la plantilla y el borrador local funcionan.</p>'
          : ''
      }`;
    default:
      return `<p class="empty">No se pidió carta a la nube${r.cloudError ? ` (${esc(r.cloudError)})` : ''}.</p>`;
  }
}

function renderLetter() {
  document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]').forEach((t) => {
    const sel = t.dataset.view === state.view;
    t.setAttribute('aria-selected', String(sel));
    t.tabIndex = sel ? 0 : -1;
  });
  const body = $('#sheet-body');
  body.setAttribute('aria-labelledby', `tab-${state.view}`);
  body.dataset.view = state.view;
  if (!state.result) {
    body.innerHTML = state.view === 'local' ? localBlock() : '<p class="empty">Completá tu situación y tocá “Preparar carta y nota”. La plantilla y la nota funcionan incluso sin internet.</p>';
    return;
  }
  const tpl = letterBlock('Plantilla', state.result.template, `${wordCount(state.result.template)} palabras · sin modelo`, 'letter-template');
  if (state.view === 'plantilla') body.innerHTML = tpl;
  else if (state.view === 'nube') body.innerHTML = cloudBlock();
  else if (state.view === 'local') body.innerHTML = localBlock();
  else body.innerHTML = `<div class="compare">${localBlock()}${cloudBlock()}${tpl}</div>`;
}

$('#sheet-body').addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  const text = btn.parentElement?.querySelector('.letter__text')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Carta copiada';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => (btn.textContent = 'Copiar carta'), 2000);
});

// ---------------------------------------------------------------------------
// Negotiation note
// ---------------------------------------------------------------------------

function renderNote() {
  const r = state.result;
  const p = state.profile;
  if (!r || !p) return;
  const n = r.note;
  const range = `${formatMoney(n.suggestedRange.min, n.suggestedRange.currency)} – ${formatMoney(n.suggestedRange.max, n.suggestedRange.currency)}`;
  $('#nota-body').innerHTML = `
    <p class="note__headline" data-band="${n.band.id}">${esc(n.headline)}</p>
    <dl class="note__facts">
      <div><dt>Diferencia</dt><dd>${n.gapPct >= 0 ? '+' : ''}${n.gapPct.toFixed(1)} %</dd></div>
      <div><dt>Rango para decir</dt><dd>${esc(range)}</dd></div>
      <div><dt>Oferta publica</dt><dd>${n.offerRange ? esc(`${formatMoney(n.offerRange.min, n.offerRange.currency)}${n.offerRange.max !== n.offerRange.min ? ` – ${formatMoney(n.offerRange.max, n.offerRange.currency)}` : ''}`) : 'sin rango'}</dd></div>
    </dl>
    <h3>Qué tan realista es</h3>
    <ul>${n.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <h3>Cuándo mencionarlo</h3>
    <ul>${n.whenToMention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <p class="fine">Reglas fijas, sin modelo. Conversión con 1 USD = ${n.constants.USD_TO_GTQ} GTQ (constante de referencia). Bandas: menos de 10 % conservadora, 10–25 % razonable, 25–40 % ambiciosa, más de 40 % muy ambiciosa.</p>`;
}

// ---------------------------------------------------------------------------
// "Qué salió a la nube"
// ---------------------------------------------------------------------------

function renderCloudPending(useCloud: boolean) {
  $('#nube-body').innerHTML = useCloud && navigator.onLine ? '<p class="empty">Tachando datos sensibles y consultando a la nube…</p>' : '<p class="empty">Preparando…</p>';
}

function renderCloud() {
  const r = state.result;
  if (!r) return;
  const statusText: Record<GenerateResult['cloudStatus'], string> = {
    sent: 'Enviado: solo el texto de abajo salió del dispositivo.',
    blocked: 'Bloqueado: el control final detectó datos sensibles. No salió nada.',
    offline: 'Sin conexión: no salió nada.',
    skipped: 'No se pidió carta a la nube: no salió nada.',
    error: 'Se intentó enviar el texto de abajo, pero la nube respondió con error.',
  };
  const redactions = r.route.redactions;
  const rows = redactions
    .map(
      (x) =>
        `<tr><td>${esc(x.field)}</td><td>${esc(TYPE_LABEL[x.finding.type])}</td><td><s>${esc(x.finding.match)}</s></td><td>${esc(x.finding.rule === 'own_name' ? '{{NOMBRE}}' : TAGS[x.finding.type])}</td></tr>`,
    )
    .join('');
  const residual = r.route.residual.length
    ? `<div class="residual" role="alert"><p>El control final encontró esto después del tachado:</p><ul>${r.route.residual
        .map((f) => `<li>${esc(TYPE_LABEL[f.type])}: “${esc(f.match)}” (${esc(f.rule)})</li>`)
        .join('')}</ul><p>Editá el texto para quitarlo o desmarcá la nube.</p></div>`
    : '';
  const sent = r.sent[0];
  $('#nube-body').innerHTML = `
    <p class="cloud__status" data-status="${r.cloudStatus}" data-testid="cloud-status">${esc(statusText[r.cloudStatus])}</p>
    ${residual}
    <details class="kept" open>
      <summary>Se quedó en tu dispositivo</summary>
      <ul>${Object.values(LOCAL_ONLY_FIELDS).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </details>
    <details class="redactions" ${redactions.length ? 'open' : ''}>
      <summary>Datos tachados antes de salir (${redactions.length})</summary>
      ${redactions.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Campo</th><th scope="col">Tipo</th><th scope="col">Original (solo aquí)</th><th scope="col">Salió como</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No hubo nada que tachar.</p>'}
    </details>
    <details class="payload" ${sent ? '' : ''}>
      <summary>${sent ? `Texto exacto enviado (${sent.bytes.toLocaleString('es-GT')} bytes, ${esc(sent.destination)})` : 'Texto que se habría enviado'}</summary>
      <pre data-testid="cloud-payload">${esc(`${r.route.prompt.system}\n\n${r.route.prompt.user}`)}</pre>
    </details>`;
}

function renderAll() {
  renderStatus();
  renderModel();
  renderLetter();
  renderNote();
  renderCloud();
}

window.addEventListener('online', renderStatus);
window.addEventListener('offline', renderStatus);

void isModelCached().then((cached) => {
  state.modelCached = cached;
  renderModel();
  renderStatus();
});
renderAll();
