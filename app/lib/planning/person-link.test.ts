import { describe, expect, it } from 'vitest';
import { personIdentityMatches, personTypeForRole } from './person-link';

describe('personTypeForRole', () => {
  it('maps personal roles to their planning entity', () => {
    expect(personTypeForRole('arbitre')).toBe('officiel');
    expect(personTypeForRole('encadrant')).toBe('encadrant');
    expect(personTypeForRole('accompagnateur')).toBe('accompagnateur');
    expect(personTypeForRole('admin')).toBeNull();
    expect(personTypeForRole('superadmin')).toBeNull();
  });
});

describe('personIdentityMatches', () => {
  it('matches by stable id and type even if the name changed', () => {
    expect(personIdentityMatches(
      { nom: 'Nouveau nom', personId: 12, personType: 'officiel' },
      { personLinks: [{ personId: 12, personType: 'officiel', personNom: 'Ancien nom' }] },
    )).toBe(true);
  });

  it('does not match the same numeric id from a different person type', () => {
    expect(personIdentityMatches(
      { nom: 'Dupont', personId: 12, personType: 'encadrant' },
      { personLinks: [{ personId: 12, personType: 'officiel', personNom: 'Dupont différent' }] },
    )).toBe(false);
  });

  it('falls back to normalized name for historical assignments without ids', () => {
    expect(personIdentityMatches(
      { nom: '  Jean Dupont ' },
      { personLinks: [{ personId: 0, personType: 'officiel', personNom: 'jean dupont' }] },
    )).toBe(true);
  });

  it('matches against any of several roles held by the same user', () => {
    expect(personIdentityMatches(
      { nom: 'Dupont', personId: 5, personType: 'encadrant' },
      { personLinks: [
        { personId: 12, personType: 'officiel', personNom: 'Dupont' },
        { personId: 5, personType: 'encadrant', personNom: 'Dupont' },
      ] },
    )).toBe(true);
  });
});
