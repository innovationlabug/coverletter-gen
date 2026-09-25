import { describe, expect, it } from 'vitest';
import { buildNegotiationNote, parseOfferSalaryRange } from '../../src/lib/negotiation';
import { USD_TO_GTQ } from '../../src/lib/money';
import { baseProfile } from './fixtures';

describe('parseOfferSalaryRange', () => {
  it.each([
    ['Salario entre Q18,000 y Q22,000', 18000, 22000, 'GTQ'],
    ['Rango: Q12,000 - Q15,000', 12000, 15000, 'GTQ'],
    ['Ofrecemos Q10 mil a Q14 mil', 10000, 14000, 'GTQ'],
    ['Pay: $2,000–$2,500 USD monthly', 2000, 2500, 'USD'],
    ['Salary range USD 2000 to 2500', 2000, 2500, 'USD'],
    ['Salario: Q18,000 más prestaciones', 18000, 18000, 'GTQ'],
    ['Ofrecemos 12 - 14 mil', 12000, 14000, 'GTQ'],
  ])('%s', (offer, min, max, currency) => {
    expect(parseOfferSalaryRange(offer)).toMatchObject({ min, max, currency });
  });
  it('returns null when there is no salary', () => {
    expect(parseOfferSalaryRange('Buscamos dev con 3 años de experiencia desde 2020')).toBeNull();
    expect(parseOfferSalaryRange(undefined)).toBeNull();
  });
});

describe('buildNegotiationNote', () => {
  it('computes the gap and band', () => {
    const n = buildNegotiationNote(baseProfile);
    expect(n.gapPct).toBeCloseTo(30, 5);
    expect(n.band.id).toBe('ambiciosa');
    expect(n.offerRange).toMatchObject({ min: 18000, max: 22000 });
    expect(n.offerPosition).toBe('within');
  });

  it.each([
    [14000, 'recorte'],
    [15000, 'conservadora'],
    [16400, 'conservadora'],
    [16500, 'razonable'],
    [18700, 'razonable'],
    [18750, 'ambiciosa'],
    [21000, 'muy_ambiciosa'],
  ])('desired %i → %s', (desired, band) => {
    expect(buildNegotiationNote({ ...baseProfile, salarioDeseado: desired, oferta: '' }).band.id).toBe(band);
  });

  it('converts USD with the documented constant', () => {
    const n = buildNegotiationNote({ ...baseProfile, salarioActual: 15000, monedaActual: 'GTQ', salarioDeseado: 2500, monedaDeseada: 'USD', oferta: '' });
    expect(n.desiredGTQ).toBe(2500 * USD_TO_GTQ);
    expect(n.constants.USD_TO_GTQ).toBe(7.7);
    expect(n.gapPct).toBeCloseTo(((2500 * 7.7 - 15000) / 15000) * 100, 5);
  });

  it('detects promotion and junior cases', () => {
    const n = buildNegotiationNote({ ...baseProfile, puestoActual: 'Analista', puestoDeseado: 'Gerente de datos', aniosExperiencia: 1, oferta: '' });
    expect(n.isPromotion).toBe(true);
    expect(n.advice.join(' ')).toMatch(/paso arriba/);
    expect(n.advice.join(' ')).toMatch(/menos de 2 años/);
  });

  it('when-to-mention rules', () => {
    const asks = buildNegotiationNote({ ...baseProfile, oferta: 'Enviar CV con pretensión salarial' });
    expect(asks.offerAsksExpectation).toBe(true);
    expect(asks.whenToMention.join(' ')).toMatch(/formulario o en el correo/);
    expect(asks.whenToMention[0]).toMatch(/Nunca escribas cifras/);
    const none = buildNegotiationNote({ ...baseProfile, oferta: '' });
    expect(none.whenToMention.join(' ')).toMatch(/Esperá a que Recursos Humanos/);
    const range = buildNegotiationNote(baseProfile);
    expect(range.whenToMention.join(' ')).toMatch(/ya publica un rango/);
  });

  it('offer position above / below', () => {
    expect(buildNegotiationNote({ ...baseProfile, salarioDeseado: 25000 }).offerPosition).toBe('above');
    expect(buildNegotiationNote({ ...baseProfile, salarioDeseado: 16000 }).offerPosition).toBe('below');
  });

  it('suggests a rounded range 10 % wide', () => {
    const n = buildNegotiationNote(baseProfile);
    expect(n.suggestedRange).toEqual({ min: 19500, max: 21500, currency: 'GTQ' });
  });
});
