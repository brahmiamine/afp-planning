import { describe, expect, it } from 'vitest';
import {
  zonedDateParts,
  zonedDayKey,
  zonedDayStart,
  zonedIsoWeekKey,
  zonedWeekday,
} from './planning-time';

// Référence : samedi 22/08/2026, dimanche 23/08/2026, lundi 24/08/2026.
// En été, Paris = UTC+2.
const PARIS = 'Europe/Paris';

describe('planning time zone helpers (issue #45)', () => {
  it('calcule le jour de semaine dans le fuseau du club, pas en UTC', () => {
    // Samedi 22/08/2026 23:30 à Paris (21:30 UTC) : samedi dans les deux fuseaux.
    expect(zonedWeekday(Date.UTC(2026, 7, 22, 21, 30), PARIS)).toBe(6);
    // Dimanche 23/08/2026 00:30 à Paris = samedi 22:30 UTC : dimanche à Paris, samedi en UTC.
    expect(zonedWeekday(Date.UTC(2026, 7, 22, 22, 30), PARIS)).toBe(0);
    expect(zonedWeekday(Date.UTC(2026, 7, 22, 22, 30), 'UTC')).toBe(6);
  });

  it('calcule la clé de jour dans le fuseau du club', () => {
    expect(zonedDayKey(Date.UTC(2026, 7, 22, 22, 30), PARIS)).toBe('2026-08-23');
    expect(zonedDayKey(Date.UTC(2026, 7, 22, 22, 30), 'UTC')).toBe('2026-08-22');
  });

  it('calcule la semaine ISO sur la date civile du club', () => {
    // Dimanche 23/08/2026 22:30 UTC = lundi 24/08/2026 00:30 à Paris : la semaine change.
    const timestamp = Date.UTC(2026, 7, 23, 22, 30);
    expect(zonedIsoWeekKey(timestamp, PARIS)).not.toBe(zonedIsoWeekKey(timestamp, 'UTC'));
    // Lundi 05/01/2026 12:00 UTC : semaine ISO 2 de 2026, quel que soit le fuseau proche.
    expect(zonedIsoWeekKey(Date.UTC(2026, 0, 5, 12, 0), 'UTC')).toBe('2026-2');
  });

  it('calcule le minuit local du jour dans le fuseau du club', () => {
    // Minuit le 23/08/2026 à Paris = 22:00 UTC le 22/08 (heure d'été).
    expect(zonedDayStart(Date.UTC(2026, 7, 23, 12, 0), PARIS)).toBe(Date.UTC(2026, 7, 22, 22, 0));
    expect(zonedDayStart(Date.UTC(2026, 7, 23, 12, 0), 'UTC')).toBe(Date.UTC(2026, 7, 23, 0, 0));
  });

  it('expose les parties calendaires dans le fuseau du club', () => {
    expect(zonedDateParts(Date.UTC(2026, 7, 22, 22, 30), PARIS)).toEqual({ year: 2026, month: 8, day: 23 });
  });

  it('retombe sur UTC si le fuseau est invalide', () => {
    expect(zonedWeekday(Date.UTC(2026, 7, 22, 22, 30), 'Mars/Olympus')).toBe(6);
  });
});
