import { describe, expect, it } from 'vitest';
import { canEdit, hasFieldRole, isReadOnlyRole, readOnlyRolesOf } from './roles';

describe('multi-role admin + terrain (issue #85)', () => {
  it('keeps admin capability while exposing terrain capability', () => {
    expect(canEdit(['admin', 'arbitre'])).toBe(true);
    expect(isReadOnlyRole(['admin', 'arbitre'])).toBe(false);
    expect(hasFieldRole(['admin', 'arbitre'])).toBe(true);
    expect(readOnlyRolesOf(['admin', 'arbitre'])).toEqual(['arbitre']);
  });

  it('recognizes every terrain role on a cumulative account', () => {
    expect(hasFieldRole(['admin', 'encadrant'])).toBe(true);
    expect(hasFieldRole(['admin', 'accompagnateur'])).toBe(true);
  });

  it('does not expose personal terrain actions to an admin-only account', () => {
    expect(hasFieldRole(['admin'])).toBe(false);
  });
});
