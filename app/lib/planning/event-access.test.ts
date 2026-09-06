import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { isAssignedToPlanningEvent, resolvePlanningEventForAccess } from './event-access';

const admin: SessionUser = {
  id: 1,
  clubId: 'afp',
  email: 'admin@example.com',
  nom: 'Admin',
  roles: ['admin'],
  role: 'admin',
  telephone: null,
  indisponibilites: null,
  active: true,
  icalToken: 'token-admin',
  notifyChannel: 'push',
};

const encadrant: SessionUser = {
  id: 7,
  clubId: 'afp',
  email: 'encadrant@example.com',
  nom: 'Jean Dupont',
  roles: ['encadrant'],
  role: 'encadrant',
  telephone: null,
  indisponibilites: null,
  active: true,
  icalToken: 'token-encadrant',
  notifyChannel: 'push',
};

/** Compte cumulant admin + un rôle terrain (issue #85). */
const adminEncadrant: SessionUser = {
  id: 7,
  clubId: 'afp',
  email: 'admin-encadrant@example.com',
  nom: 'Jean Dupont',
  roles: ['admin', 'encadrant'],
  role: 'admin',
  telephone: null,
  indisponibilites: null,
  active: true,
  icalToken: 'token-admin-encadrant',
  notifyChannel: 'push',
};

const liveEntrainement = {
  id: 'entrainement-1',
  payload: {
    id: 'entrainement-1',
    type: 'entrainement',
    date: '23/08/2026',
    time: '18:00',
    planningStatus: 'published',
    // Le brouillon retire Jean Dupont sans republier.
    encadrants: [],
  },
};

function makeDb(publishedRecordRow: Record<string, unknown> | null): DataSource {
  return {
    query: async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return [];
      if (sql.includes('FROM planning_records')) {
        return publishedRecordRow ? [publishedRecordRow] : [];
      }
      return [];
    },
    getRepository: (name: string) => ({
      findBy: async () => (name === 'Entrainement' ? [liveEntrainement] : []),
      findOneBy: async () => (name === 'Entrainement' ? liveEntrainement : null),
    }),
  } as unknown as DataSource;
}

function publishedRecordRow(events: unknown[]): Record<string, unknown> {
  return {
    id: 'published-planning:afp',
    clubId: 'afp',
    kind: 'published-planning',
    eventType: null,
    eventId: null,
    ownerUserId: 1,
    personType: null,
    personId: null,
    payload: JSON.stringify({
      schemaVersion: 1,
      publishedAt: '2026-08-01T00:00:00.000Z',
      publishedByUserId: 1,
      events,
    }),
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

const publishedSnapshotWithEncadrant = {
  eventId: 'entrainement-1',
  eventType: 'entrainement',
  title: 'Entraînement',
  date: '23/08/2026',
  time: '18:00',
  durationMinutes: 90,
  location: null,
  planningStatus: 'published',
  event: { id: 'entrainement-1', type: 'entrainement', date: '23/08/2026', time: '18:00', planningStatus: 'published' },
  extras: null,
  assignments: {
    arbitre: [],
    encadrant: [{ nom: 'Jean Dupont', numero: '', personId: 7, personType: 'encadrant', status: 'pending' }],
    accompagnateur: [],
  },
};

describe('resolvePlanningEventForAccess', () => {
  it('always resolves the live draft for an admin, published or not', async () => {
    const db = makeDb(publishedRecordRow([publishedSnapshotWithEncadrant]));
    const snapshot = await runWithClubId('afp', () =>
      resolvePlanningEventForAccess(db, admin, 'entrainement', 'entrainement-1'));
    expect(snapshot?.assignments.encadrant).toEqual([]);
  });

  it('resolves the published snapshot for a personal account, even if the live draft has since been edited', async () => {
    const db = makeDb(publishedRecordRow([publishedSnapshotWithEncadrant]));
    const snapshot = await runWithClubId('afp', () =>
      resolvePlanningEventForAccess(db, encadrant, 'entrainement', 'entrainement-1'));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.assignments.encadrant[0]?.personId).toBe(7);
  });

  it('does not grant a personal account access to an event only present in the draft', async () => {
    const db = makeDb(publishedRecordRow([]));
    const snapshot = await runWithClubId('afp', () =>
      resolvePlanningEventForAccess(db, encadrant, 'entrainement', 'entrainement-1'));
    expect(snapshot).toBeNull();
  });

  it('falls back to the live draft for a personal account when the club has never published', async () => {
    const db = makeDb(null);
    const snapshot = await runWithClubId('afp', () =>
      resolvePlanningEventForAccess(db, encadrant, 'entrainement', 'entrainement-1'));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.assignments.encadrant).toEqual([]);
  });
});

describe('isAssignedToPlanningEvent', () => {
  it('still recognizes a cumulative admin + encadrant account assigned to the event (issue #85)', () => {
    expect(isAssignedToPlanningEvent(adminEncadrant, publishedSnapshotWithEncadrant as never)).toBe(true);
  });

  it('returns false for an admin without any field role, even if somehow present in assignments', () => {
    expect(isAssignedToPlanningEvent(admin, publishedSnapshotWithEncadrant as never)).toBe(false);
  });
});
