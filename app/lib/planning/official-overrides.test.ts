import { describe, expect, it } from 'vitest';
import type { Match } from '@/types/match';
import { applyOfficialOverrides, computeOfficialOverrides } from './official-overrides';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm-1',
    date: '20/09/2026',
    competition: 'Championnat',
    localTeam: 'AFP',
    awayTeam: 'Visiteur',
    venue: 'domicile',
    time: '18:00',
    horaireRendezVous: '17:00',
    details: {
      stadium: 'Stade source',
      dateTime: '',
      competition: 'Championnat',
      address: '1 rue de la source',
      terrainType: '',
      itineraryLink: '',
      rawText: '',
    },
    ...overrides,
  };
}

describe('corrections manuelles des matchs officiels (issue #151)', () => {
  it('enregistre la valeur source de chaque champ corrigé', () => {
    const overrides = computeOfficialOverrides(
      match(),
      match({ time: '19:30' }),
      { at: '2026-09-01T10:00:00.000Z', userId: 7 },
    );

    expect(overrides).toEqual({
      time: { value: '19:30', sourceValue: '18:00', updatedAt: '2026-09-01T10:00:00.000Z', updatedByUserId: 7 },
    });
  });

  it('survit à plusieurs scrapes, y compris quand la source change', () => {
    const corrected = {
      ...match({ time: '19:30' }),
      sourceOverrides: computeOfficialOverrides(match(), match({ time: '19:30' }), { at: '2026-09-01T10:00:00.000Z' }),
    };

    const first = applyOfficialOverrides(match(), corrected.sourceOverrides, '2026-09-02T04:00:00.000Z');
    expect(first.match.time).toBe('19:30');
    expect(first.drifts).toEqual([]);

    const second = applyOfficialOverrides(
      match({ time: '20:00' }),
      first.match.sourceOverrides,
      '2026-09-03T04:00:00.000Z',
    );
    expect(second.match.time).toBe('19:30');
    expect(second.match.sourceOverrides?.time?.sourceValue).toBe('20:00');
    expect(second.drifts).toEqual([
      { field: 'time', overrideValue: '19:30', previousSourceValue: '18:00', sourceValue: '20:00' },
    ]);
  });

  it('supprime la correction quand l’administrateur revient à la valeur source', () => {
    const corrected = match({
      time: '19:30',
      sourceOverrides: { time: { value: '19:30', sourceValue: '18:00', updatedAt: '2026-09-01T10:00:00.000Z' } },
    });

    expect(computeOfficialOverrides(corrected, match({ time: '18:00' }), { at: '2026-09-04T10:00:00.000Z' }))
      .toEqual({});
  });

  it('corrige aussi le stade et l’adresse sans toucher aux autres champs de la source', () => {
    const overrides = computeOfficialOverrides(
      match(),
      match({ details: { ...match().details!, stadium: 'Stade corrigé' } }),
      { at: '2026-09-01T10:00:00.000Z' },
    );
    const applied = applyOfficialOverrides(
      match({ competition: 'Coupe' }),
      overrides,
      '2026-09-05T04:00:00.000Z',
    );

    expect(applied.match.details?.stadium).toBe('Stade corrigé');
    expect(applied.match.details?.address).toBe('1 rue de la source');
    expect(applied.match.competition).toBe('Coupe');
  });
});
