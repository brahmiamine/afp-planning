import { describe, expect, it } from 'vitest';
import { canEdit, hasFieldRole, isReadOnlyRole, readOnlyRolesOf } from './roles';

describe('multi-role admin + terrain accounts (issue #85)', () => {
  it('isReadOnlyRole rejects a cumulative admin + arbitre account', () => {
    expect(isReadOnlyRole(['admin', 'arbitre'])).toBe(false);
  });

  it('hasFieldRole still recognizes the field role on a cumulative admin + arbitre account', () => {
    expect(hasFieldRole(['admin', 'arbitre'])).toBe(true);
    expect(hasFieldRole(['admin', 'encadrant'])).toBe(true);
    expect(hasFieldRole(['admin', 'accompagnateur'])).toBe(true);
  });

  it('hasFieldRole is false for an admin-only account', () => {
    expect(hasFieldRole(['admin'])).toBe(false);
    expect(hasFieldRole(null)).toBe(false);
    expect(hasFieldRole(undefined)).toBe(false);
  });

  it('hasFieldRole is true for a pure field-role account', () => {
    expect(hasFieldRole(['arbitre'])).toBe(true);
  });

  it('canEdit still recognizes the admin capability on a cumulative account', () => {
    expect(canEdit(['admin', 'arbitre'])).toBe(true);
  });

  it('readOnlyRolesOf keeps returning only the field roles on a cumulative account', () => {
    expect(readOnlyRolesOf(['admin', 'arbitre'])).toEqual(['arbitre']);
  });
});
