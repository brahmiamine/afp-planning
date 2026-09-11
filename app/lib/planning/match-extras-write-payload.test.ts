import { describe, expect, it } from 'vitest';
import { pickMatchExtrasWritePayload } from './match-extras-write-payload';

describe('pickMatchExtrasWritePayload', () => {
  it('ne conserve que les champs acceptés par PUT /api/matches/[id]', () => {
    const extras = {
      id: 'match-1',
      confirmed: true,
      arbitreTouche: [{ nom: 'Léa', numero: '' }],
      contactEncadrants: [{ nom: 'Marc', numero: '' }],
      contactAccompagnateur: [],
      planningRevision: 4,
      planningStatus: 'published',
      officialSourceSnapshot: { id: 'match-1', date: '13/09/2026' },
      sourceStatus: 'active',
      schemaVersion: 2,
    };

    expect(pickMatchExtrasWritePayload(extras)).toEqual({
      id: 'match-1',
      confirmed: true,
      arbitreTouche: [{ nom: 'Léa', numero: '' }],
      contactEncadrants: [{ nom: 'Marc', numero: '' }],
      contactAccompagnateur: [],
    });
  });
});
