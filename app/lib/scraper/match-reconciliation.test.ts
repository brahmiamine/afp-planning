import { describe, expect, it } from 'vitest';
import type { Match } from '@/types/match';
import {
  internalMatchIdForSource,
  reconcileOfficialMatchIdentities,
  scoreOfficialMatchIdentity,
  type ExistingOfficialMatchIdentity,
} from './match-reconciliation';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'source-old-abc12',
    type: 'officiel',
    date: '20/08/2026',
    competition: 'Championnat U15 - Journée 3',
    categorie: 'U15',
    localTeam: 'AFP 18 U15',
    awayTeam: 'Paris Nord FC U15',
    venue: 'domicile',
    time: '18:00',
    horaireRendezVous: '16:30',
    ...overrides,
  };
}

function existing(id: string, overrides: Partial<Match> = {}): ExistingOfficialMatchIdentity {
  return { id, payload: match({ id, ...overrides }) };
}

const observedAt = '2026-08-21T18:00:00.000Z';

describe('official match identity reconciliation', () => {
  it('keeps a legacy internal id when the source slug changes with high confidence', () => {
    const current = existing('source-old-abc12');
    const incoming = match({
      id: 'source-new-def34',
      time: '19:30',
      horaireRendezVous: '18:00',
    });

    const [decision] = reconcileOfficialMatchIdentities('afp', [current], [incoming], observedAt);

    expect(decision).toMatchObject({
      sourceId: 'source-new-def34',
      internalId: 'source-old-abc12',
      kind: 'reconciled',
    });
    expect(decision?.score).toBeGreaterThanOrEqual(85);
    expect(decision?.match).toMatchObject({
      id: 'source-old-abc12',
      sourceMatchId: 'source-new-def34',
      sourceMatchIds: ['source-old-abc12', 'source-new-def34'],
      sourceIdentityReconciledAt: observedAt,
    });
  });

  it('uses an existing source alias as an exact match', () => {
    const current = existing('scr_internal', {
      sourceMatchId: 'source-current',
      sourceMatchIds: ['source-old', 'source-current'],
    });

    const [decision] = reconcileOfficialMatchIdentities(
      'afp',
      [current],
      [match({ id: 'source-old' })],
      observedAt,
    );

    expect(decision).toMatchObject({
      sourceId: 'source-old',
      internalId: 'scr_internal',
      kind: 'exact',
    });
    expect(decision?.match.sourceMatchIds).toEqual(['source-old', 'source-current']);
  });

  it('maps simultaneous known aliases onto the same internal match', () => {
    const current = existing('scr_internal', {
      sourceMatchId: 'source-current',
      sourceMatchIds: ['source-old', 'source-current'],
    });

    const decisions = reconcileOfficialMatchIdentities(
      'afp',
      [current],
      [match({ id: 'source-old' }), match({ id: 'source-current', time: '19:00' })],
      observedAt,
    );

    expect(decisions).toHaveLength(2);
    expect(decisions.every((decision) => decision.internalId === 'scr_internal')).toBe(true);
    expect(decisions.every((decision) => decision.kind === 'exact')).toBe(true);
  });

  it('does not reconcile a different opponent', () => {
    const [decision] = reconcileOfficialMatchIdentities(
      'afp',
      [existing('source-old-abc12')],
      [match({ id: 'unrelated-source', awayTeam: 'Autre Club U15' })],
      observedAt,
    );

    expect(decision?.kind).toBe('new');
    expect(decision?.internalId).toBe(internalMatchIdForSource('afp', 'unrelated-source'));
  });

  it('does not reconcile a different or missing competition', () => {
    expect(scoreOfficialMatchIdentity(
      match(),
      match({ id: 'new-source', competition: 'Coupe de Paris U15' }),
      ['source-old-abc12'],
    )).toBe(0);
    expect(scoreOfficialMatchIdentity(
      match(),
      match({ id: 'new-source', competition: '' }),
      ['source-old-abc12'],
    )).toBe(0);
  });

  it('does not reconcile when home/away context changes', () => {
    const score = scoreOfficialMatchIdentity(
      match(),
      match({ id: 'new-source', venue: 'extérieur' }),
      ['source-old-abc12'],
    );
    expect(score).toBe(0);
  });

  it('does not reconcile when the date moves beyond the safety window', () => {
    const score = scoreOfficialMatchIdentity(
      match(),
      match({ id: 'new-source', date: '10/09/2026' }),
      ['source-old-abc12'],
    );
    expect(score).toBe(0);
  });

  it('refuses an ambiguous fuzzy match instead of attaching planning data to the wrong row', () => {
    const candidates = [
      existing('old-a'),
      existing('old-b'),
    ];

    const [decision] = reconcileOfficialMatchIdentities(
      'afp',
      candidates,
      [match({ id: 'new-source' })],
      observedAt,
    );

    expect(decision?.kind).toBe('new');
    expect(decision?.internalId).not.toBe('old-a');
    expect(decision?.internalId).not.toBe('old-b');
  });

  it('fails closed when one source alias is already attached to multiple internal matches', () => {
    const candidates = [
      existing('internal-a', { sourceMatchId: 'duplicated-source', sourceMatchIds: ['duplicated-source'] }),
      existing('internal-b', { sourceMatchId: 'duplicated-source', sourceMatchIds: ['duplicated-source'] }),
    ];

    const [decision] = reconcileOfficialMatchIdentities(
      'afp',
      candidates,
      [match({ id: 'duplicated-source' })],
      observedAt,
    );

    expect(decision?.kind).toBe('new');
    expect(decision?.internalId).toBe(internalMatchIdForSource('afp', 'duplicated-source'));
  });

  it('reserves exact identities before fuzzy matching regardless of scraper order', () => {
    const exact = existing('internal-exact', {
      sourceMatchId: 'exact-source',
      sourceMatchIds: ['exact-source'],
    });
    const fuzzy = existing('internal-fuzzy', {
      sourceMatchId: 'old-fuzzy-source',
      sourceMatchIds: ['old-fuzzy-source'],
      awayTeam: 'Paris Est FC U15',
    });

    const decisions = reconcileOfficialMatchIdentities(
      'afp',
      [exact, fuzzy],
      [
        match({ id: 'new-fuzzy-source', awayTeam: 'Paris Est FC U15' }),
        match({ id: 'exact-source' }),
      ],
      observedAt,
    );

    expect(decisions.find((item) => item.sourceId === 'exact-source')).toMatchObject({
      internalId: 'internal-exact',
      kind: 'exact',
    });
    expect(decisions.find((item) => item.sourceId === 'new-fuzzy-source')).toMatchObject({
      internalId: 'internal-fuzzy',
      kind: 'reconciled',
    });
  });

  it('generates deterministic tenant-scoped internal ids for new source matches', () => {
    const sourceId = 'shared-fixture-source-id';
    const afpId = internalMatchIdForSource('afp', sourceId);
    const otherClubId = internalMatchIdForSource('other-club', sourceId);

    expect(afpId).toBe(internalMatchIdForSource('afp', sourceId));
    expect(afpId).not.toBe(sourceId);
    expect(afpId).not.toBe(otherClubId);
  });

  it('rejects oversized external source ids instead of persisting unbounded scraper data', () => {
    expect(() => reconcileOfficialMatchIdentities(
      'afp',
      [],
      [match({ id: 'x'.repeat(513) })],
      observedAt,
    )).toThrow(/512 caractères/);
  });
});
