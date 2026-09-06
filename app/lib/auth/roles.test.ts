import { describe, expect, it } from 'vitest';
import { hasTerrainRole, isReadOnlyRole } from './roles';

describe('terrain roles', () => {
  it('distinguishes a pure terrain account from an admin + terrain account', () => {
    expect(isReadOnlyRole(['arbitre'])).toBe(true);
    expect(isReadOnlyRole(['admin', 'arbitre'])).toBe(false);
  });

  it('recognizes terrain capability even when admin is also present (issue #85)', () => {
    expect(hasTerrainRole(['admin', 'arbitre'])).toBe(true);
    expect(hasTerrainRole(['admin', 'encadrant'])).toBe(true);
    expect(hasTerrainRole(['admin', 'accompagnateur'])).toBe(true);
    expect(hasTerrainRole(['admin'])).toBe(false);
  });
});
