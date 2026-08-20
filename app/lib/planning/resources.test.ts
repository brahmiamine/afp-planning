import { describe, expect, it } from 'vitest';
import { bookingIntervalsOverlap, normalizePlanningResource } from './resources';

describe('planning resources', () => {
  it('detects overlapping exclusive bookings from real event durations', () => {
    expect(bookingIntervalsOverlap(
      { date: '22/08/2026', time: '14:00', durationMinutes: 120 },
      { date: '22/08/2026', time: '15:30', durationMinutes: 90 },
    )).toBe(true);
    expect(bookingIntervalsOverlap(
      { date: '22/08/2026', time: '14:00', durationMinutes: 60 },
      { date: '22/08/2026', time: '15:30', durationMinutes: 90 },
    )).toBe(false);
  });

  it('normalizes resource coordinates and capacity', () => {
    expect(normalizePlanningResource({ name: 'Minibus', type: 'vehicule', exclusive: true, capacity: 9, lat: 48.8, lon: 2.3 })).toMatchObject({
      name: 'Minibus', type: 'vehicule', exclusive: true, capacity: 9, lat: 48.8, lon: 2.3,
    });
  });
});
