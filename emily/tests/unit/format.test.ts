import { describe, expect, it } from 'vitest';
import { formatAmountInput, formatIntegerInput, groupThousands, letterFileName } from '../../src/ui/format';

describe('groupThousands', () => {
  it('adds commas every three digits', () => {
    expect(groupThousands('5')).toBe('5');
    expect(groupThousands('15000')).toBe('15,000');
    expect(groupThousands('1234567')).toBe('1,234,567');
  });
});

describe('formatAmountInput', () => {
  it('formats as you type and keeps the caret at the end', () => {
    expect(formatAmountInput('1500', 4)).toEqual({ value: '1,500', caret: 5 });
    expect(formatAmountInput('1,5000', 6)).toEqual({ value: '15,000', caret: 6 });
  });

  it('keeps the caret next to the same digit when editing in the middle', () => {
    // "15,000" → user types "9" after "15" → "159,000" with the caret after the 9
    expect(formatAmountInput('159,000', 3)).toEqual({ value: '159,000', caret: 3 });
    // deleting the comma's neighbour: "15,00|0" → backspace → "15,0|0"
    expect(formatAmountInput('15,00', 4)).toEqual({ value: '1,500', caret: 4 });
  });

  it('strips currency symbols, spaces and letters', () => {
    expect(formatAmountInput('Q 15 000', 8).value).toBe('15,000');
    expect(formatAmountInput('US$2500', 7).value).toBe('2,500');
  });

  it('drops pasted cents but not thousands written with a dot', () => {
    expect(formatAmountInput('15,000.50', 9, { pasted: true }).value).toBe('15,000');
    expect(formatAmountInput('15000.5', 7, { pasted: true }).value).toBe('15,000');
    expect(formatAmountInput('15.000', 6, { pasted: true }).value).toBe('15,000');
  });

  it('does not treat a partial edit as cents when typing', () => {
    expect(formatAmountInput('15,0', 4).value).toBe('150');
  });

  it('caps absurdly long amounts', () => {
    expect(formatAmountInput('1'.repeat(20), 20).value.replace(/,/g, '')).toHaveLength(10);
  });
});

describe('formatIntegerInput', () => {
  it('keeps at most two digits', () => {
    expect(formatIntegerInput('5 años')).toBe('5');
    expect(formatIntegerInput('123')).toBe('12');
  });
});

describe('letterFileName', () => {
  it('builds a safe, readable file name', () => {
    expect(letterFileName('Telus International')).toBe('carta-telus-international.txt');
    expect(letterFileName('Cementos Progreso, S.A.')).toBe('carta-cementos-progreso-s-a.txt');
    expect(letterFileName('Café Ñandú')).toBe('carta-cafe-nandu.txt');
    expect(letterFileName('   ')).toBe('carta-de-interes.txt');
  });
});
