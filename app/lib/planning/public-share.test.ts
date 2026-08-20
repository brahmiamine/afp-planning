import { describe, expect, it } from 'vitest';
import type { PlanningEventSnapshot } from './event-store';
import { hashShareToken, toPublicPlanningItem } from './public-share';

const snapshot: PlanningEventSnapshot = {
  eventId: 'match-42',
  eventType: 'officiel',
  title: 'AFP – Visiteur',
  date: '23/08/2026',
  time: '15:00',
  durationMinutes: 90,
  location: 'Stade AFP',
  planningStatus: 'published',
  event: {
    id: 'match-42',
    type: 'officiel',
    date: '23/08/2026',
    time: '15:00',
    horaireRendezVous: '14:00',
    competition: 'Championnat',
    categorie: 'U15',
    localTeam: 'AFP',
    awayTeam: 'Visiteur',
    venue: 'domicile',
  },
  extras: { id: 'match-42', planningStatus: 'published' },
  assignments: {
    arbitre: [{ nom: 'Nom Privé', numero: '0612345678', personId: 7, personType: 'officiel', status: 'accepted' }],
    encadrant: [],
    accompagnateur: [],
  },
};

describe('public planning shares', () => {
  it('hashes raw share tokens without retaining the original value', () => {
    const raw = 'secret-public-share-token';
    const hash = hashShareToken(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(raw);
    expect(hashShareToken(raw)).toBe(hash);
  });

  it('redacts assignments and private identities from the public projection', () => {
    const item = toPublicPlanningItem(snapshot);
    const serialized = JSON.stringify(item);
    expect(item).toEqual(expect.objectContaining({
      eventType: 'officiel',
      title: 'AFP – Visiteur',
      date: '23/08/2026',
      time: '15:00',
      location: 'Stade AFP',
    }));
    expect(serialized).not.toContain('Nom Privé');
    expect(serialized).not.toContain('0612345678');
    expect(serialized).not.toContain('personId');
  });
});
