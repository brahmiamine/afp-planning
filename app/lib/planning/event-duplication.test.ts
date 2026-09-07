import { describe, expect, it } from 'vitest';
import type { Entrainement, Match, Plateau } from '@/types/match';
import { creationEndpointFor, extractReusableEventFields } from './event-duplication';

describe('extractReusableEventFields (issue #188)', () => {
  it('excludes date/time and publication metadata for amical matches', () => {
    const match: Match = {
      id: 'm1',
      type: 'amical',
      date: '20/09/2026',
      time: '15:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: 'Visiteurs',
      venue: 'domicile',
      horaireRendezVous: '14:00',
      planningStatus: 'published',
      planningRevision: 3,
    };
    const fields = extractReusableEventFields('amical', match);
    expect(fields).not.toHaveProperty('date');
    expect(fields).not.toHaveProperty('time');
    expect(fields).not.toHaveProperty('planningStatus');
    expect(fields).not.toHaveProperty('planningRevision');
    expect(fields).toMatchObject({ localTeam: 'AFP', awayTeam: 'Visiteurs', competition: 'Amical' });
  });

  it('resets encadrant responses for entrainement (keeps nom/personId only)', () => {
    const training: Entrainement = {
      id: 't1',
      type: 'entrainement',
      date: '20/09/2026',
      time: '18:00',
      lieu: 'Terrain A',
      encadrants: [{ nom: 'Coach', numero: '0600000000', personId: 12, status: 'accepted', respondedAt: '2026-01-01T00:00:00Z' }],
    };
    const fields = extractReusableEventFields('entrainement', training);
    expect(fields.encadrants).toEqual([{ nom: 'Coach', personId: 12 }]);
  });

  it('keeps plateau categories and lieu', () => {
    const plateau: Plateau = {
      id: 'p1',
      type: 'plateau',
      date: '21/09/2026',
      time: '09:00',
      lieu: 'Gymnase',
      categories: ['U9', 'U11'],
    };
    const fields = extractReusableEventFields('plateau', plateau);
    expect(fields).toMatchObject({ lieu: 'Gymnase', categories: ['U9', 'U11'] });
  });
});

describe('creationEndpointFor', () => {
  it('maps each duplicable type to its creation route', () => {
    expect(creationEndpointFor('amical')).toBe('/api/matches-amicaux');
    expect(creationEndpointFor('entrainement')).toBe('/api/entrainements');
    expect(creationEndpointFor('plateau')).toBe('/api/plateaux');
  });
});
