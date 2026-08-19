import { describe, it, expect } from 'vitest';
import {
  normalizeIndisponibilites,
  getOfficielAvailabilityStatus,
  normalizeDateValue,
  extractMinutes,
  dateKeyToComparable,
} from './officiel-availability';

describe('normalizeDateValue', () => {
  it('normalizes DD/MM/YYYY dates, padding single digits', () => {
    expect(normalizeDateValue('5/1/2026')).toBe('05/01/2026');
  });

  it('normalizes YYYY-MM-DD dates into DD/MM/YYYY', () => {
    expect(normalizeDateValue('2026-01-05')).toBe('05/01/2026');
  });

  it('returns null for invalid dates', () => {
    expect(normalizeDateValue('not-a-date')).toBeNull();
    expect(normalizeDateValue('32/13/2026')).toBeNull();
  });
});

describe('extractMinutes', () => {
  it('parses HH:MM', () => {
    expect(extractMinutes('14:30')).toBe(14 * 60 + 30);
  });

  it('parses HHhMM', () => {
    expect(extractMinutes('9h05')).toBe(9 * 60 + 5);
  });

  it('returns null for missing/invalid input', () => {
    expect(extractMinutes(undefined)).toBeNull();
    expect(extractMinutes('not-a-time')).toBeNull();
  });
});

describe('dateKeyToComparable', () => {
  it('produces an ascending sortable number', () => {
    const a = dateKeyToComparable('01/01/2026')!;
    const b = dateKeyToComparable('02/01/2026')!;
    const c = dateKeyToComparable('01/02/2026')!;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('normalizeIndisponibilites', () => {
  it('swaps reversed day-range start/end dates', () => {
    const result = normalizeIndisponibilites([{ dateStart: '10/01/2026', dateEnd: '05/01/2026' }]);
    expect(result[0]?.dateStart).toBe('05/01/2026');
    expect(result[0]?.dateEnd).toBe('10/01/2026');
  });

  it('dedupes identical rules', () => {
    const result = normalizeIndisponibilites([
      { dateStart: '05/01/2026', dateEnd: '05/01/2026' },
      { dateStart: '05/01/2026', dateEnd: '05/01/2026' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('parses a time-slot rule', () => {
    const result = normalizeIndisponibilites([
      { type: 'time-slot', date: '05/01/2026', startTime: '10:00', endTime: '12:00' },
    ]);
    expect(result[0]?.type).toBe('time-slot');
    expect(result[0]?.startTime).toBe('10:00');
  });
});

describe('getOfficielAvailabilityStatus', () => {
  it('blocks a day-range unavailability', () => {
    const officiel = { nom: 'Jean', indisponibilites: [{ id: '1', type: 'day-range' as const, dateStart: '05/01/2026', dateEnd: '10/01/2026' }] };
    const status = getOfficielAvailabilityStatus(officiel, '07/01/2026', '10:00');
    expect(status.unavailable).toBe(true);
    expect(status.blockLevel).toBe('day');
  });

  it('flags a time-slot unavailability without blocking the whole day', () => {
    const officiel = {
      nom: 'Jean',
      indisponibilites: [{ id: '1', type: 'time-slot' as const, date: '07/01/2026', startTime: '09:00', endTime: '11:00' }],
    };
    const status = getOfficielAvailabilityStatus(officiel, '07/01/2026', '10:00');
    expect(status.unavailable).toBe(true);
    expect(status.blockLevel).toBe('time');
  });

  it('returns available when no rule matches', () => {
    const officiel = { nom: 'Jean', indisponibilites: [] };
    const status = getOfficielAvailabilityStatus(officiel, '07/01/2026', '10:00');
    expect(status.unavailable).toBe(false);
  });
});
