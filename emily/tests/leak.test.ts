/**
 * LEAK TEST — the automated proof that the current salary (and the current employer) never
 * leave the device.
 *
 * Two layers, both running the real orchestrator (router → gate → cloud):
 *  A) The cloud boundary `cloud.generateLetter` is spied: we inspect the exact prompt it receives.
 *  B) The real Firebase AI Logic SDK runs, with `globalThis.fetch` mocked: we inspect every byte
 *     of every HTTP request the SDK tries to make.
 * For each profile we search the outgoing text for the salary in all its written forms
 * (15000, 15,000, 15.000, Q15,000, Q 15 000, 15 mil, 15k, quince mil, …) and for the employer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { amountVariants, containsAmount, normalize } from '../src/lib/money';
import type { Profile } from '../src/lib/types';

const PROFILES: Profile[] = [
  {
    nombre: 'Ana Lucía Pérez',
    puestoActual: 'Analista de datos en Banco Industrial',
    empleadorActual: 'Banco Industrial, S.A.',
    salarioActual: 15000,
    monedaActual: 'GTQ',
    puestoDeseado: 'Data Engineer',
    empresaDestino: 'Telus International',
    salarioDeseado: 19000,
    monedaDeseada: 'GTQ',
    aniosExperiencia: 5,
    logros:
      'Hoy gano Q15,000 (o sea 15 mil, Q 15 000, 15.000, 15k, Q15K, quince mil quetzales). ' +
      'En el BI automaticé reportes. En banco industrial lideré la migración.',
    oferta: 'Data Engineer. Salario Q18,000 - Q22,000. Indicar pretensión salarial.',
  },
  {
    nombre: 'Kevin Ajú',
    puestoActual: 'Soporte técnico',
    empleadorActual: 'Tigo Guatemala',
    salarioActual: 6500,
    monedaActual: 'GTQ',
    puestoDeseado: 'Desarrollador junior',
    empresaDestino: 'Nearsure',
    salarioDeseado: 9000,
    monedaDeseada: 'GTQ',
    aniosExperiencia: 1,
    logros: 'En TIGO atiendo 60 tickets diarios; gano 6,500 al mes, seis mil quinientos. Mi jefe Mario Chen me recomendó.',
  },
  {
    nombre: 'Sofía Herrera',
    puestoActual: 'Senior Product Designer',
    empleadorActual: 'Cementos Progreso',
    salarioActual: 3200,
    monedaActual: 'USD',
    puestoDeseado: 'Lead Product Designer',
    empresaDestino: 'Hugo Technologies',
    salarioDeseado: 4200,
    monedaDeseada: 'USD',
    aniosExperiencia: 8,
    logros: 'Cobro $3,200 (USD 3200, 3.2k). En Progreso rediseñé el portal de clientes. Escribime a sofia.h@gmail.com',
    oferta: 'Lead Designer, remote. Salary USD 4,000 to 4,800. Contact: +502 5555-1234',
  },
  {
    nombre: 'José Tzoc',
    puestoActual: 'Contador general',
    empleadorActual: 'Distribuidora Xelajú',
    salarioActual: 12500,
    monedaActual: 'GTQ',
    puestoDeseado: 'Gerente financiero',
    empresaDestino: 'Grupo Pantaleón',
    salarioDeseado: 18000,
    monedaDeseada: 'GTQ',
    aniosExperiencia: 12,
    logros: 'Gano 12,500 (doce mil quinientos, 12.5k). En Distribuidora Xelaju reduje el cierre contable de 10 a 4 días. DPI 2567 89012 0101, NIT 1234567-8, vivo en zona 3 de Quetzaltenango.',
  },
];

/** Every literal form listed in the project rules, plus the generated variants. */
function salaryForms(amount: number): string[] {
  const k = amount / 1000;
  const literal = [
    String(amount),
    amount.toLocaleString('en-US'),
    amount.toLocaleString('de-DE'),
    `Q${amount.toLocaleString('en-US')}`,
    `Q ${amount.toLocaleString('fr-FR').replace(/ | /g, ' ')}`,
    `${k} mil`,
    `${k}k`,
  ];
  return [...new Set([...literal, ...amountVariants(amount)])];
}

function assertNoLeak(outgoing: string, p: Profile) {
  const lower = normalize(outgoing);
  expect(containsAmount(outgoing, p.salarioActual), `salary ${p.salarioActual} leaked`).toBeNull();
  for (const form of salaryForms(p.salarioActual)) {
    if (/^[\d.,\s]+$/.test(form)) {
      // digit-only forms: require non-digit boundaries
      const re = new RegExp(`(^|[^\\d])${form.replace(/[.,]/g, '[.,]').replace(/ /g, '\\s')}(?!\\d)`);
      expect(re.test(outgoing), `form "${form}" leaked`).toBe(false);
    } else {
      expect(lower.includes(normalize(form)), `form "${form}" leaked`).toBe(false);
    }
  }
  const employer = normalize(p.empleadorActual).replace(/,?\s*s\.a\.?$/, '');
  expect(lower.includes(employer), `employer "${employer}" leaked`).toBe(false);
  expect(outgoing.includes(p.nombre), 'user name leaked').toBe(false);
}

describe('A) cloud boundary spied', () => {
  it.each(PROFILES.map((p) => [p.nombre, p] as const))('%s: nothing sensitive reaches cloud.generateLetter', async (_n, p) => {
    const { cloud } = await import('../src/lib/cloud');
    const { generateAll } = await import('../src/lib/orchestrator');
    const spy = vi.spyOn(cloud, 'generateLetter').mockResolvedValue({ text: 'Carta {{NOMBRE}}', model: 'mock', latencyMs: 1 });
    const r = await generateAll(p, { online: true, useCloud: true });
    expect(r.cloudStatus).toBe('sent');
    expect(spy).toHaveBeenCalledTimes(1);
    const prompt = spy.mock.calls[0][0];
    assertNoLeak(`${prompt.system}\n${prompt.user}`, p);
    // what the UI shows as "sent" is exactly what the boundary received
    expect(r.sent[0].user).toBe(prompt.user);
    // the name is restored locally
    expect(r.cloudLetter?.finalText).toBe(`Carta ${p.nombre}`);
    // the private note still used the salary locally
    expect(r.note.currentGTQ).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('the gate blocks instead of sending when a residual survives the redactor', async () => {
    const { cloud } = await import('../src/lib/cloud');
    const { generateAll } = await import('../src/lib/orchestrator');
    const spy = vi.spyOn(cloud, 'generateLetter');
    // "15,000 usuarios" is a count, so the generic redactor keeps it... but it is also this
    // user's exact salary. The gate knows the salary and blocks: better a false block than a leak.
    const p = { ...PROFILES[0], logros: 'Mi app llegó a 15,000 usuarios activos.', oferta: '' };
    const r = await generateAll(p, { online: true, useCloud: true });
    expect(r.cloudStatus).toBe('blocked');
    expect(r.route.residual.map((f) => f.rule)).toContain('known_current_salary');
    expect(spy).not.toHaveBeenCalled();
    expect(r.sent).toEqual([]);
    spy.mockRestore();
  });

  it('offline: nothing is sent, note + template still produced', async () => {
    const { cloud } = await import('../src/lib/cloud');
    const { generateAll } = await import('../src/lib/orchestrator');
    const spy = vi.spyOn(cloud, 'generateLetter');
    const r = await generateAll(PROFILES[1], { online: false, useCloud: true });
    expect(r.cloudStatus).toBe('offline');
    expect(spy).not.toHaveBeenCalled();
    expect(r.template.length).toBeGreaterThan(500);
    expect(r.note.headline).toMatch(/%/);
    spy.mockRestore();
  });
});

describe('B) real Firebase AI Logic SDK with global fetch mocked', () => {
  const bodies: { url: string; body: string }[] = [];

  beforeEach(() => {
    bodies.length = 0;
    vi.resetModules();
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '1:0:web:test');
    vi.stubEnv('VITE_RECAPTCHA_ENTERPRISE_KEY', '');
    vi.stubEnv('VITE_APPCHECK_DEBUG_TOKEN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : '';
        bodies.push({ url, body: `${url}\n${JSON.stringify(init?.headers ?? {})}\n${body}` });
        return new Response(
          JSON.stringify({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Estimado equipo:\n\nCarta.\n\n{{NOMBRE}}' }] }, finishReason: 'STOP', index: 0 }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(PROFILES.map((p) => [p.nombre, p] as const))('%s: no HTTP request carries sensitive data', async (_n, p) => {
    const { generateAll } = await import('../src/lib/orchestrator');
    const r = await generateAll(p, { online: true, useCloud: true });
    expect(r.cloudError).toBeUndefined();
    expect(r.cloudStatus).toBe('sent');
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((b) => b.url.includes('firebasevertexai.googleapis.com') && b.url.includes('gemini-3.8-flash'))).toBe(true);
    for (const b of bodies) assertNoLeak(b.body, p);
    expect(r.cloudLetter?.finalText).toContain(p.nombre);
  });
});
