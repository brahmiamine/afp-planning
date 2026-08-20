import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { listPersonalAssignments } from './personal-planning';

const user: SessionUser = {
  id: 7,
  clubId: 'afp',
  email: 'arbitre@example.com',
  nom: 'Jean Dupont',
  roles: ['arbitre'],
  personLinks: [{ personNom: 'Jean Dupont', personType: 'officiel', personId: 42 }],
  role: 'arbitre',
  personNom: 'Jean Dupont',
  personType: 'officiel',
  personId: 42,
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
          personId: 42,
          personType: 'officiel',
          status: 'pending',
        }],
      },
    }],
  };

  return {
    getRepository: (name: string) => ({
      find: async () => rows[name] ?? [],
      findBy: async () => rows[name] ?? [],
    }),
  } as unknown as DataSource;
}

describe('personal planning publication visibility', () => {
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
