import { describe, expect, it } from 'vitest';
import { normalizeLegacyPlanningPayload } from './json-migrator';

describe('normalizeLegacyPlanningPayload (issue #94)', () => {
  it('normalizes a missing planning status to draft', () => {
    expect(normalizeLegacyPlanningPayload({ id: 'legacy-1' })).toMatchObject({
      id: 'legacy-1',
      planningStatus: 'draft',
    });
  });

  it('normalizes an invalid planning status to draft', () => {
    expect(normalizeLegacyPlanningPayload({ id: 'legacy-2', planningStatus: 'unknown' }))
      .toMatchObject({ planningStatus: 'draft' });
  });

  it('preserves an explicit valid publication status', () => {
    expect(normalizeLegacyPlanningPayload({ id: 'legacy-3', planningStatus: 'published' }))
      .toMatchObject({ planningStatus: 'published' });
  });
});
