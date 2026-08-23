import { describe, expect, it } from 'vitest';
import type { Entrainement, Match, Plateau } from '@/types/match';
import { applyPlanningEventUpdate } from './event-update';

describe('applyPlanningEventUpdate', () => {
  it('updates all editable match fields while preserving source identity', () => {
    const current: Match = {
      id: 'match-1',
      type: 'officiel',
      date: '01/09/2026',
      time: '10:00',
      durationMinutes: 90,
      competition: 'Championnat',
      categorie: 'U17',
      localTeam: 'AFP',
      awayTeam: 'Paris FC',
      venue: 'domicile',
      horaireRendezVous: '09:00',
      sourceMatchId: 'source-123',
      details: {
        stadium: 'Ancien stade',
        dateTime: '01/09/2026 - 10:00',
        competition: 'Championnat',
        address: 'Ancienne adresse',
        terrainType: 'Synthétique',
        itineraryLink: 'https://example.test/old',
        rawText: 'source raw details',
      },
      staff: {
        referee: 'Ancien arbitre',
        assistant1: 'Ancien assistant 1',
        assistant2: 'Ancien assistant 2',
        rawText: 'source raw staff',
      },
    };

    const updated = applyPlanningEventUpdate('officiel', current, {
      date: '02/09/2026',
      time: '11:30',
      durationMinutes: 105,
      localTeam: 'AFP Paris',
      awayTeam: 'Red Star',
      competition: 'Coupe',
      categorie: 'U18',
      venue: 'extérieur',
      horaireRendezVous: '10:15',
      details: {
        stadium: 'Nouveau stade',
        address: 'Nouvelle adresse',
        terrainType: 'Pelouse',
        itineraryLink: 'https://example.test/new',
      },
      staff: {
        referee: 'Nouvel arbitre',
        assistant1: 'Assistant A',
        assistant2: 'Assistant B',
      },
    }) as Match;

    expect(updated).toMatchObject({
      id: 'match-1',
      sourceMatchId: 'source-123',
      date: '02/09/2026',
      time: '11:30',
      durationMinutes: 105,
      localTeam: 'AFP Paris',
      awayTeam: 'Red Star',
      competition: 'Coupe',
      categorie: 'U18',
      venue: 'extérieur',
      horaireRendezVous: '10:15',
      details: {
        stadium: 'Nouveau stade',
        address: 'Nouvelle adresse',
        terrainType: 'Pelouse',
        itineraryLink: 'https://example.test/new',
        dateTime: '02/09/2026 - 11:30',
        competition: 'Coupe',
        rawText: 'source raw details',
      },
      staff: {
        referee: 'Nouvel arbitre',
        assistant1: 'Assistant A',
        assistant2: 'Assistant B',
        rawText: 'source raw staff',
      },
    });
  });

  it('updates an entraînement without losing its encadrants', () => {
    const current: Entrainement = {
      id: 'training-1',
      type: 'entrainement',
      date: '03/09/2026',
      time: '18:00',
      lieu: 'Terrain A',
      categorie: 'U15',
      durationMinutes: 90,
      encadrants: [{ nom: 'Coach A', numero: '0600000000' }],
    };

    const updated = applyPlanningEventUpdate('entrainement', current, {
      date: '04/09/2026',
      time: '18:30',
      lieu: 'Terrain B',
      categorie: 'U16',
      durationMinutes: 120,
    }) as Entrainement;

    expect(updated).toMatchObject({
      date: '04/09/2026',
      time: '18:30',
      lieu: 'Terrain B',
      categorie: 'U16',
      durationMinutes: 120,
      encadrants: [{ nom: 'Coach A', numero: '0600000000' }],
    });
  });

  it('updates plateau categories', () => {
    const current: Plateau = {
      id: 'plateau-1',
      type: 'plateau',
      date: '05/09/2026',
      time: '09:00',
      lieu: 'Stade A',
      categories: ['U9'],
      durationMinutes: 120,
    };

    const updated = applyPlanningEventUpdate('plateau', current, {
      categories: ['U9', 'U10', ' U10 '],
      lieu: 'Stade B',
    }) as Plateau;

    expect(updated.lieu).toBe('Stade B');
    expect(updated.categories).toEqual(['U9', 'U10']);
  });
});
