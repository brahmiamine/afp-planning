import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { listPersonalAssignments } from './personal-planning';

const clubId = process.env.APP_CLUB_ID?.trim() || 'afp';

const user: SessionUser = {
  id: 7,
  clubId,
  email: 'arbitre@example.com',
  nom: 'Jean Dupont',
  roles: ['arbitre'],
  role: 'arbitre',
  telephone: null,
  indisponibilites: null,
  active: true,
  icalToken: 'token',
  notifyChannel: 'push',
};

function makeDb(planningStatus: 'draft' | 'published' | undefined): DataSource {
  const rows: Record<string, unknown[]> = {
    MatchOfficial: [],
    MatchAmical: [{
      id: 'amical-1',
      payload: {
        id: 'amical-1',
        type: 'amical',
        date: '23/08/2026',
        time: '15:00',
        competition: 'Amical',
        localTeam: 'AFP 18',
        awayTeam: 'Visiteur',
        venue: 'domicile',
        horaireRendezVous: '14:00',
      },
    }],
    Entrainement: [],
    Plateau: [],
    MatchExtra: [{
      matchId: 'amical-1',
      payload: {
        id: 'amical-1',
        ...(planningStatus ? { planningStatus } : {}),
        arbitreTouche: [{
          nom: 'Jean Dupont',
          numero: '',
          personId: 7,
          personType: 'officiel',
          status: 'pending',
        }],
      },
    }],
  };

  return {
    query: async () => [],
    getRepository: (name: string) => ({
      find: async () => rows[name] ?? [],
      findBy: async () => rows[name] ?? [],
    }),
  } as unknown as DataSource;
}

function makeDbWithPublishedSnapshot(events: unknown[]): DataSource {
  const record = {
    id: `published-planning:${clubId}`,
    clubId,
    kind: 'published-planning',
    eventType: null,
    eventId: null,
    ownerUserId: 1,
    personType: null,
    personId: null,
    payload: JSON.stringify({ schemaVersion: 1, publishedAt: '2026-08-01T00:00:00.000Z', publishedByUserId: 1, events }),
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  return {
    query: async (sql: string) => {
      if (sql.trim().startsWith('SELECT') && sql.includes('FROM planning_records')) return [record];
      return [];
    },
    getRepository: () => ({ find: async () => [], findBy: async () => [] }),
  } as unknown as DataSource;
}

describe('personal planning publication visibility', () => {
  it('conserve visible un événement annulé déjà publié auparavant (issue #40)', async () => {
    const cancelledMatch = {
      eventId: 'amical-2',
      eventType: 'amical',
      title: 'AFP – Visiteur',
      date: '23/08/2026',
      time: '15:00',
      durationMinutes: 90,
      location: 'Stade AFP',
      planningStatus: 'cancelled',
      event: {
        id: 'amical-2', type: 'amical', date: '23/08/2026', time: '15:00',
        horaireRendezVous: '14:00', competition: 'Amical', localTeam: 'AFP', awayTeam: 'Visiteur', venue: 'domicile',
      },
      extras: {
        id: 'amical-2',
        planningStatus: 'cancelled',
        arbitreTouche: [{ nom: 'Jean Dupont', numero: '', personId: 7, personType: 'officiel', status: 'accepted' }],
      },
      assignments: {
        arbitre: [{ nom: 'Jean Dupont', numero: '', personId: 7, personType: 'officiel', status: 'accepted' }],
        encadrant: [],
        accompagnateur: [],
      },
    };

    const assignments = await runWithClubId(clubId, () => listPersonalAssignments(makeDbWithPublishedSnapshot([cancelledMatch]), user));

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ eventId: 'amical-2', cancelled: true, status: 'accepted' });
  });


  it('does not expose a draft event to the assigned person', async () => {
    const assignments = await listPersonalAssignments(makeDb('draft'), user);
    expect(assignments).toEqual([]);
  });

  it('keeps legacy events without a publication status visible', async () => {
    const assignments = await listPersonalAssignments(makeDb(undefined), user);
    expect(assignments).toHaveLength(1);
  });

  it('exposes a published event to the assigned person', async () => {
    const assignments = await listPersonalAssignments(makeDb('published'), user);
    expect(assignments).toHaveLength(1);
  });
});
