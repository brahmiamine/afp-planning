import { describe, it, expect } from 'vitest';
import { parseDateString, compareDates, sortDates, formatDateWithDayName } from './date';

describe('parseDateString', () => {
  it('parses DD/MM/YYYY into a Date', () => {
    const date = parseDateString('05/01/2026');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
  });

  it('falls back gracefully on malformed input', () => {
    const date = parseDateString('');
    expect(date).toBeInstanceOf(Date);
  });
});

describe('compareDates', () => {
  it('orders earlier dates before later ones', () => {
    expect(compareDates('01/01/2026', '02/01/2026')).toBeLessThan(0);
    expect(compareDates('02/01/2026', '01/01/2026')).toBeGreaterThan(0);
    expect(compareDates('01/01/2026', '01/01/2026')).toBe(0);
  });
});

describe('sortDates', () => {
  it('sorts a list of DD/MM/YYYY dates chronologically', () => {
    const sorted = sortDates(['15/01/2026', '01/01/2026', '20/12/2025']);
    expect(sorted).toEqual(['20/12/2025', '01/01/2026', '15/01/2026']);
  });
});

describe('formatDateWithDayName', () => {
  it('prefixes the date with a capitalized French day name', () => {
    const formatted = formatDateWithDayName('05/01/2026');
    expect(formatted.endsWith('05/01/2026')).toBe(true);
    expect(formatted.charAt(0)).toBe(formatted.charAt(0).toUpperCase());
  });
});
