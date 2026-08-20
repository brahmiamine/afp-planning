import { describe, expect, it } from 'vitest';
import type { AssignmentContact } from '@/types/match';
import {
  activeContacts,
  applyReminderStage,
  eventStartTimestamp,
  isAttendancePending,
  isVisiblePublicationStatus,
  markAttendance,
  needsReplacement,
  nextReminderStage,
  normalizePlanningStatus,
} from './p0-rules';

function contact(overrides: Partial<AssignmentContact> = {}): AssignmentContact {
  return {
    nom: 'Jean Dupont',
    numero: '',
    personId: 1,
    personType: 'officiel',
    status: 'pending',
    assignedAt: '2026-08-17T08:00:00.000Z',
    ...overrides,
  };
}

describe('publication rules', () => {
  it('keeps legacy events visible but hides draft and cancelled states', () => {
    expect(normalizePlanningStatus(undefined)).toBe('published');
    expect(isVisiblePublicationStatus(normalizePlanningStatus(undefined))).toBe(true);
    expect(isVisiblePublicationStatus('draft')).toBe(false);
    expect(isVisiblePublicationStatus('cancelled')).toBe(false);
    expect(isVisiblePublicationStatus('modified')).toBe(true);
  });
});

describe('club time zone', () => {
  it('converts a local summer time in Paris to UTC', () => {
    expect(eventStartTimestamp('23/08/2026', '15:00', 'Europe/Paris'))
      .toBe(Date.UTC(2026, 7, 23, 13, 0));
  });
});

describe('replacement rules', () => {
  it('requires a replacement when every assigned person declined', () => {
    const declined = [contact({ status: 'declined' })];
    expect(activeContacts(declined)).toEqual([]);
    expect(needsReplacement(declined)).toBe(true);
  });

  it('does not require a replacement when another active assignment remains', () => {
    expect(needsReplacement([
      contact({ status: 'declined', personId: 1 }),
      contact({ status: 'accepted', personId: 2, nom: 'Marie Martin' }),
    ])).toBe(false);
  });
});

describe('automatic reminders', () => {
  it('prioritizes the J-1 reminder and never sends the same stage twice', () => {
    const now = Date.parse('2026-08-20T08:00:00.000Z');
    const start = Date.parse('2026-08-21T07:00:00.000Z');
    expect(nextReminderStage(contact(), start, now)).toBe('24h');

    const reminded = applyReminderStage(contact(), '24h', new Date(now).toISOString());
    expect(nextReminderStage(reminded, start, now)).not.toBe('24h');
    expect(reminded.reminderCount).toBe(1);
  });

  it('sends a 48-hour no-response reminder before J-3 when applicable', () => {
    const now = Date.parse('2026-08-20T08:00:00.000Z');
    const start = Date.parse('2026-08-25T08:00:00.000Z');
    expect(nextReminderStage(contact(), start, now)).toBe('awaiting-48h');
  });

  it('does not remind accepted or declined assignments', () => {
    const now = Date.parse('2026-08-20T08:00:00.000Z');
    const start = Date.parse('2026-08-21T08:00:00.000Z');
    expect(nextReminderStage(contact({ status: 'accepted' }), start, now)).toBeNull();
    expect(nextReminderStage(contact({ status: 'declined' }), start, now)).toBeNull();
  });
});

describe('attendance rules', () => {
  it('requires attendance after a completed accepted assignment', () => {
    const now = Date.parse('2026-08-20T10:00:00.000Z');
    const eventEnd = Date.parse('2026-08-20T09:00:00.000Z');
    expect(isAttendancePending(contact({ status: 'accepted' }), eventEnd, now)).toBe(true);
  });

  it('closes attendance once a presence outcome is recorded', () => {
    const now = Date.parse('2026-08-20T10:00:00.000Z');
    const eventEnd = Date.parse('2026-08-20T09:00:00.000Z');
    const present = markAttendance(contact({ status: 'accepted' }), 'present', '2026-08-20T10:00:00.000Z');
    expect(present.attendanceStatus).toBe('present');
    expect(isAttendancePending(present, eventEnd, now)).toBe(false);
  });
});
