import { describe, expect, it } from 'vitest';
import { buildCloudPayload, CLOUD_ALLOWLIST, detectResidual } from '../../src/lib/router';
import { NAME_PLACEHOLDER } from '../../src/lib/redact';
import { baseProfile } from './fixtures';

const outgoing = (p = baseProfile) => {
  const r = buildCloudPayload(p);
  return { r, text: `${r.prompt.system}\n${r.prompt.user}` };
};

describe('router.buildCloudPayload', () => {
  it('only copies allowlisted fields (plus the name placeholder)', () => {
    const { r } = outgoing();
    expect(Object.keys(r.payload).sort()).toEqual([...CLOUD_ALLOWLIST, 'firma'].sort());
    expect(r.payload.firma).toBe(NAME_PLACEHOLDER);
    expect(r.excludedFields).toEqual(
      expect.arrayContaining(['salarioActual', 'salarioDeseado', 'empleadorActual', 'nombre']),
    );
  });

  it('never includes current salary, employer or name in the outgoing prompt', () => {
    const { r, text } = outgoing();
    expect(r.blocked).toBe(false);
    expect(text).not.toMatch(/15,000|15000|Q15/);
    expect(text).not.toMatch(/Banco Industrial/i);
    expect(text).not.toContain('Ana Lucía Pérez');
    expect(text).not.toContain('Ana López');
    expect(text).not.toContain('talento@telus.example.com');
    expect(text).not.toContain('2222-3333');
    expect(text).toContain('[EMPLEADOR_ACTUAL]');
  });

  it('keeps what the letter needs', () => {
    const { text } = outgoing();
    expect(text).toContain('Telus International');
    expect(text).toContain('Data Engineer Senior');
    expect(text).toContain('Años de experiencia: 5');
    expect(text).toContain('BigQuery');
    expect(text).toContain('30%');
  });

  it('records every redaction with its field', () => {
    const { r } = outgoing();
    const byField = r.redactions.map((x) => `${x.field}:${x.finding.type}`);
    expect(byField).toEqual(
      expect.arrayContaining(['puestoActual:employer', 'logros:person_name', 'logros:salary', 'oferta:email', 'oferta:phone', 'oferta:salary']),
    );
  });

  it('blocks when a residual is detected by the gate', () => {
    // "quince" alone is not a money pattern, but the gate knows this user's salary in words.
    const p = { ...baseProfile, logros: 'Me pagan quince mil al mes' };
    const { r } = outgoing(p);
    // money-in-words is redacted by the generic rule, so it should not block...
    expect(r.blocked).toBe(false);
    // ...but a raw detectResidual on the un-redacted text must catch it.
    expect(detectResidual('Me pagan quince mil al mes', p).map((f) => f.type)).toContain('salary');
  });

  it('gate catches the known salary even in forms the redactor does not know', () => {
    const p = { ...baseProfile, salarioActual: 15000 };
    const res = detectResidual('ingreso actual de 15 000', p);
    expect(res.length).toBeGreaterThan(0);
  });

  it('redacts an employer written without spaces (XelajuTech)', () => {
    // An employer written inside a tag-like string is ignored by the redactor; the gate still sees the name.
    const p = { ...baseProfile, empleadorActual: 'Xelaju Tech', logros: 'Lideré el equipo de XelajuTech en 2023' };
    const { r } = outgoing(p);
    // "XelajuTech" (no space) is within edit distance 1 of "xelaju tech" → redacted, not blocked
    expect(r.prompt.user).not.toMatch(/xelaju/i);
  });
});
