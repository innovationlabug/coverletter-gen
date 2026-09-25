import { describe, expect, it } from 'vitest';
import { checkLetter } from '../../src/lib/letter-checks';
import { finalizeLetter } from '../../src/lib/prompt';
import { buildTemplateLetter } from '../../src/lib/template';
import { wordCount } from '../../src/lib/text';
import { baseProfile } from './fixtures';

describe('buildTemplateLetter', () => {
  const letter = buildTemplateLetter(baseProfile);

  it('is 250–400 words and signed', () => {
    const n = wordCount(letter);
    expect(n).toBeGreaterThanOrEqual(250);
    expect(n).toBeLessThanOrEqual(400);
    expect(letter.trim().endsWith('Ana Lucía Pérez')).toBe(true);
    expect(letter.startsWith('Estimado equipo de Telus International:')).toBe(true);
  });

  it('uses clean achievements and offer requirements', () => {
    expect(letter).toContain('automaticé reportes en Python');
    expect(letter).toContain('Python y SQL avanzado');
    expect(letter).toContain('experiencia con BigQuery');
  });

  it('drops achievement items with sensitive data', () => {
    expect(letter).not.toContain('Ana López');
    expect(letter).not.toMatch(/15,000|Q15/);
    expect(letter).not.toMatch(/Banco Industrial/);
  });

  it('passes the deterministic length, tone, CTA and invented-data checks', () => {
    const c = checkLetter(letter, baseProfile);
    expect(c.longitud.pass).toBe(true);
    expect(c.tono.pass).toBe(true);
    expect(c.cta.pass).toBe(true);
    expect(c.cero_inventados.pass).toBe(true);
  });

  it('works with minimal input and no offer', () => {
    const l = buildTemplateLetter({ ...baseProfile, logros: '', oferta: undefined, aniosExperiencia: 0, puestoActual: '' });
    expect(wordCount(l)).toBeGreaterThanOrEqual(250);
    expect(l).toMatch(/inicio de mi carrera/);
  });

  it('stays under 400 words with very long achievements', () => {
    const long = Array.from({ length: 8 }, (_, i) => `- Logro número ${i + 1}: ${'impulsé mejoras de proceso con impacto en el equipo '.repeat(4)}`).join('\n');
    expect(wordCount(buildTemplateLetter({ ...baseProfile, logros: long }))).toBeLessThanOrEqual(400);
  });
});

describe('finalizeLetter', () => {
  it('restores the name and strips markdown / thinking', () => {
    const raw = '<|channel>thought\nplan<channel|>**Estimado equipo:**\n\nTexto.\n\nAtentamente,\n{{NOMBRE}}';
    expect(finalizeLetter(raw, 'Ana')).toBe('Estimado equipo:\n\nTexto.\n\nAtentamente,\nAna');
  });
});

describe('letter checks', () => {
  it('flags invented numbers, forbidden content and informal tone', () => {
    const bad = 'Hola!! Tengo 12 certificaciones y gano Q15,000. Mi jefa Ana López me llama al 5555-1234.';
    const c = checkLetter(bad, baseProfile);
    expect(c.cero_inventados.pass).toBe(false);
    expect(c.cero_inventados.detail).toMatch(/12/);
    expect(c.cero_inventados.detail).toMatch(/salario/);
    expect(c.tono.pass).toBe(false);
    expect(c.longitud.pass).toBe(false);
    expect(c.cta.pass).toBe(false);
  });
});
