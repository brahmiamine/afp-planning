import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { bookingIntervalsOverlap, eventCoordinatesFromResources, normalizePlanningResource } from './resources';

const recordMocks = vi.hoisted(() => ({
  listPlanningRecords: vi.fn(),
  getPlanningRecord: vi.fn(),
}));

vi.mock('./records', () => ({
  listPlanningRecords: recordMocks.listPlanningRecords,
  getPlanningRecord: recordMocks.getPlanningRecord,
}));

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

  it('resolves coordinates from a booked resource', async () => {
    recordMocks.listPlanningRecords.mockResolvedValueOnce([{
      id: 'booking-1',
      kind: 'resource-booking',
      payload: {
        resourceId: 'resource-42',
        eventType: 'officiel',
        eventId: 'match-1',
        quantity: 1,
        note: null,
        createdByUserId: 1,
      },
    }]);
    recordMocks.getPlanningRecord.mockResolvedValueOnce({
      id: 'resource-42',
      kind: 'resource',
      payload: {
        name: 'Terrain A',
        type: 'terrain',
        description: null,
        exclusive: true,
        capacity: null,
        location: null,
        lat: 48.8566,
        lon: 2.3522,
        active: true,
      },
    });

    await expect(eventCoordinatesFromResources(
      {} as DataSource,
      'officiel',
      'match-1',
    )).resolves.toEqual({
      lat: 48.8566,
      lon: 2.3522,
      resourceName: 'Terrain A',
    });
    expect(recordMocks.getPlanningRecord).toHaveBeenCalledWith({}, 'resource-42');
  });
});
