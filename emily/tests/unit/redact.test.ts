import { describe, expect, it } from 'vitest';
import { findMoney, findSensitive, NAME_PLACEHOLDER, redact } from '../../src/lib/redact';
import type { SensitiveType } from '../../src/lib/types';

const types = (text: string, ctx = {}) => findSensitive(text, ctx).map((f) => f.type);
const only = (text: string, type: SensitiveType, ctx = {}) =>
  findSensitive(text, ctx)
    .filter((f) => f.type === type)
    .map((f) => f.match);

describe('redactor — money (salary) in every written form', () => {
  it.each([
    ['Gano Q15,000 al mes', 'Q15,000'],
    ['Gano Q 15 000 al mes', 'Q 15 000'],
    ['Gano Q.15,000.00 mensuales', 'Q.15,000.00'],
    ['gano 15000 mensuales', '15000'],
    ['gano 15.000 mensuales', '15.000'],
    ['gano 15,000 mensuales', '15,000'],
    ['cobro $2,000 al mes', '$2,000'],
    ['cobro US$2,000', 'US$2,000'],
    ['cobro USD 2000', 'USD 2000'],
    ['cobro 2000 USD', '2000 USD'],
    ['me pagan 15 mil', '15 mil'],
    ['me pagan 15mil', '15mil'],
    ['me pagan 15k', '15k'],
    ['me pagan Q15K', 'Q15K'],
    ['me pagan 12,5 mil', '12,5 mil'],
    ['me pagan quince mil quetzales', 'quince mil quetzales'],
    ['me pagan veinte mil', 'veinte mil'],
    ['15000 quetzales', '15000 quetzales'],
    ['cobro 1,800 dólares', '1,800 dólares'],
  ])('%s → %s', (text, expected) => {
    expect(only(text, 'salary')).toEqual([expected]);
    expect(redact(text).text).toContain('[SALARIO]');
  });

  it('parses values and currencies', () => {
    const [m] = findMoney('Q15K');
    expect(m.value).toBe(15000);
    expect(m.currency).toBe('GTQ');
    expect(findMoney('USD 2,500')[0]).toMatchObject({ value: 2500, currency: 'USD' });
    expect(findMoney('quince mil')[0].value).toBe(15000);
    expect(findMoney('veinticinco mil quinientos')[0].value).toBe(25500);
  });

  it('does not flag years, small numbers, percentages, quarters or counts of things', () => {
    expect(types('Trabajo aquí desde 2019 y lideré 3 proyectos.')).toEqual([]);
    expect(types('Reduje costos 30% en el Q3 2024.')).toEqual([]);
    expect(types('La app llegó a 10,000 usuarios y 2,500 descargas.')).toEqual([]);
    expect(types('Tengo 5 años de experiencia.')).toEqual([]);
    expect(types('Mil gracias por su tiempo')).toEqual([]);
  });
});

describe('redactor — contact data and IDs', () => {
  it('emails', () => {
    expect(only('escribime a ana.lopez+cv@gmail.com', 'email')).toEqual(['ana.lopez+cv@gmail.com']);
  });
  it.each(['5555-1234', '5555 1234', '55551234', '+502 5555-1234', '(502) 2222 3333', '502 4455 6677'])('GT phone %s', (p) => {
    expect(types(`llamame al ${p} por favor`)).toEqual(['phone']);
  });
  it('does not confuse a year range with a phone', () => {
    expect(types('Trabajé ahí 2019-2023')).toEqual([]);
  });
  it.each(['2567 89012 0101', '2567-89012-0101', '2567890120101'])('DPI %s', (d) => {
    expect(types(`mi DPI es ${d}`)).toEqual(['dpi']);
  });
  it.each(['NIT: 1234567-8', 'NIT 12345678', 'nit 4567890-K', 'mi nit es 7654321-K'])('NIT %s', (n) => {
    expect(types(n)).toContain('nit');
  });
});

describe('redactor — addresses (GT heuristics)', () => {
  it.each([
    ['vivo en zona 10', 'zona 10'],
    ['oficina en 6a avenida 12-34', '6a avenida 12-34'],
    ['queda en la 4a. calle', '4a. calle'],
    ['sobre Calzada Roosevelt', 'Calzada Roosevelt'],
    ['en el km 15 carretera a El Salvador', 'km 15'],
    ['colonia Las Victorias', 'colonia Las Victorias'],
    ['casa 24', 'casa 24'],
  ])('%s', (text, match) => {
    const f = findSensitive(text).filter((x) => x.type === 'address');
    expect(f.map((x) => x.match).join(' | ')).toContain(match);
  });
});

describe('redactor — people', () => {
  it.each([
    ['mi jefa Ana López me felicitó', 'Ana López'],
    ['con mi jefe, Carlos Pérez Rodas, lanzamos', 'Carlos Pérez Rodas'],
    ['la gerente de ventas Marta Juárez aprobó', 'Marta Juárez'],
    ['mi compañero Luis Ajú y yo', 'Luis Ajú'],
    ['my manager John Smith said', 'John Smith'],
    ['reporté a la Licda. Sofía Morales', 'Licda. Sofía Morales'],
    ['el Ing. Pedro Say revisó', 'Ing. Pedro Say'],
  ])('%s', (text, name) => {
    expect(only(text, 'person_name')).toEqual([name]);
  });
  it('does not treat job titles as names', () => {
    expect(only('Reporto al Gerente General y al Director Regional', 'person_name')).toEqual([]);
  });
  it("replaces the user's own name by the placeholder", () => {
    const r = redact('Soy María José Castillo, desarrolladora', { ownNames: ['María José Castillo'] });
    expect(r.text).toBe(`Soy ${NAME_PLACEHOLDER}, desarrolladora`);
  });
});

describe('redactor — current employer', () => {
  const ctx = { employer: 'Banco Industrial, S.A.' };
  it.each([
    'Trabajo en Banco Industrial desde 2020',
    'trabajo en BANCO INDUSTRIAL',
    'trabajo en banco industrial',
    'Trabajo en el BI como analista',
    'Trabajo en Banco Indutrial (sic)',
  ])('%s', (text) => {
    expect(types(text, ctx)).toContain('employer');
    expect(redact(text, ctx).text).toContain('[EMPLEADOR_ACTUAL]');
  });
  it('accent-insensitive and distinctive tokens', () => {
    const c = { employer: 'Cervecería Centro Americana' };
    expect(types('estoy en cerveceria centro americana', c)).toContain('employer');
    expect(types('en la CCA manejo inventarios', c)).toContain('employer');
    const d = { employer: 'Cementos Progreso' };
    expect(types('en Progreso lideré', d)).toContain('employer');
    expect(types('el proyecto sigue en progreso', d)).not.toContain('employer');
  });
  it('does not redact the target company or generic words', () => {
    expect(types('Quiero trabajar en Telus International', ctx)).toEqual([]);
    expect(types('Me interesa el sector banco y finanzas', ctx)).toEqual([]);
  });
});

describe('redact() output', () => {
  it('is idempotent (running twice changes nothing)', () => {
    const ctx = { employer: 'Tigo Guatemala', ownNames: ['Ana Pérez'] };
    const text = 'Soy Ana Pérez, gano Q12,500 en Tigo, mi jefe Juan Cho, tel 5555-1234, zona 9, ana@x.com';
    const once = redact(text, ctx).text;
    expect(redact(once, ctx).text).toBe(once);
    expect(redact(once, ctx).findings).toEqual([]);
  });
  it('merges overlapping findings so nothing partial remains', () => {
    const r = redact('Pago: Q 15 000 mensuales');
    expect(r.text).toBe('Pago: [SALARIO] mensuales');
  });
});

describe('regressions found by the evaluation (eval/, first run)', () => {
  it('person pattern does not cross line breaks ("Coordinadora de enfermería⏎Empresa destino")', () => {
    expect(types('Puesto al que aplica: Coordinadora de enfermería\nEmpresa destino: Centro Médico')).toEqual([]);
  });
  it('"Lead Product Designer" is a job title, not a person', () => {
    expect(types('Puesto al que aplica: Lead Product Designer')).toEqual([]);
  });
  it('capitalised area keywords ("Residenciales Los Álamos")', () => {
    expect(only('cerca de Residenciales Los Álamos', 'address')).toEqual(['Residenciales Los Álamos']);
  });
  it('declared public strings are protected ("Café Calle Real" is the target company)', () => {
    expect(types('Empresa destino: Café Calle Real', { keep: ['Café Calle Real'] })).toEqual([]);
    expect(types('Empresa destino: Café Calle Real')).toEqual(['address']);
  });
  it('street pattern does not swallow the next line', () => {
    expect(only('Calle Real\n\nLogros', 'address')).toEqual(['Calle Real']);
  });
});

describe('regressions found by the evaluation (second run, letters)', () => {
  it('"un millón" is not "un mil"', () => {
    expect(types('para un millón de usuarios')).toEqual([]);
  });
  it('amounts in words followed by a count noun are counts', () => {
    expect(types('una app con cien mil descargas')).toEqual([]);
    expect(types('gano quince mil quetzales')).toEqual(['salary']);
  });
  it('"Ingeniero React Native Senior" is a job title, not a person', () => {
    expect(types('como Ingeniero React Native Senior')).toEqual([]);
    expect(only('la Licda. Marta Cifuentes', 'person_name')).toEqual(['Licda. Marta Cifuentes']);
  });
});
