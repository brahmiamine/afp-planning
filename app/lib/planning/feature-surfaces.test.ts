import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANNING_FEATURES } from '@/lib/settings';
import { PLANNING_FEATURE_SURFACES } from './feature-surfaces';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('périmètre documenté des feature flags (issue #149)', () => {
  it('décrit chaque flag existant', () => {
    expect(Object.keys(PLANNING_FEATURE_SURFACES).sort()).toEqual(Object.keys(DEFAULT_PLANNING_FEATURES).sort());
  });

  it('garde chaque route documentée derrière son flag', async () => {
    for (const [feature, surface] of Object.entries(PLANNING_FEATURE_SURFACES)) {
      for (const route of surface.routes) {
        const source = await readFile(path.join(repoRoot, route), 'utf8');
        const guard = new RegExp(`planningFeatureGuard\\([^,]+,\\s*'${feature}'\\s*\\)`);
        expect(guard.test(source), `${route} doit appeler planningFeatureGuard(..., '${feature}')`)
          .toBe(true);
      }
    }
  });
});
