import { describe, expect, it } from 'vitest';
import { personIdentityMatches, personTypeForRole } from './person-link';

describe('personTypeForRole', () => {
  it('maps personal roles to their planning entity', () => {
    expect(personTypeForRole('arbitre')).toBe('officiel');
    expect(personTypeForRole('encadrant')).toBe('encadrant');
    expect(personTypeForRole('accompagnateur')).toBe('accompagnateur');
    expect(personTypeForRole('admin')).toBeNull();
  });
});

describe('personIdentityMatches', () => {
  it('matches by stable id even if the name changed', () => {
    expect(personIdentityMatches(
      { nom: 'Nouveau nom', personId: 12, personType: 'officiel' },
      { id: 12, nom: 'Ancien nom' },
    )).toBe(true);
  });

  it('does not match a different numeric id', () => {
    expect(personIdentityMatches(
      { nom: 'Dupont', personId: 12, personType: 'encadrant' },
      { id: 5, nom: 'Dupont différent' },
    )).toBe(false);
  });

  it('falls back to normalized name for historical assignments without ids', () => {
    expect(personIdentityMatches(
      { nom: '  Jean Dupont ' },
      { id: 0, nom: 'jean dupont' },
    )).toBe(true);
  });
});
