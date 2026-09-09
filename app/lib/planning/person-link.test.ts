import { describe, expect, it } from 'vitest';
import {
  functionForPersonType,
  functionForPlanningRole,
  personIdentityMatches,
  personTypeForFunction,
} from './person-link';

describe('correspondance fonctions / personnes assignables (issue #209)', () => {
  it('associe chaque fonction à son entité planning', () => {
    expect(personTypeForFunction('arbitre_club')).toBe('officiel');
    expect(personTypeForFunction('encadrant')).toBe('encadrant');
    expect(personTypeForFunction('accompagnateur')).toBe('accompagnateur');
  });

  it('fait l’aller-retour entre fonction et type de personne', () => {
    expect(functionForPersonType('officiel')).toBe('arbitre_club');
    expect(functionForPersonType('encadrant')).toBe('encadrant');
    expect(functionForPersonType('accompagnateur')).toBe('accompagnateur');
  });

  it('associe chaque poste d’affectation à la fonction requise', () => {
    expect(functionForPlanningRole('arbitre')).toBe('arbitre_club');
    expect(functionForPlanningRole('encadrant')).toBe('encadrant');
    expect(functionForPlanningRole('accompagnateur')).toBe('accompagnateur');
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
