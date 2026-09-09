import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import {
  findAssignablePerson,
  functionForPersonType,
  functionForPlanningRole,
  personIdentityMatches,
  personTypeForFunction,
} from './person-link';

const dbAvailable = await isDbAvailable();

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

describe.skipIf(!dbAvailable)('findAssignablePerson — comptes inactifs (issue #206)', () => {
  it('ne propose plus un dirigeant désactivé, ni par personId ni par nom', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const active = await createTestUserAndSession('dirigeant', { clubId, nom: 'Encadrant Actif' }, ['encadrant']);
    const inactive = await createTestUserAndSession('dirigeant', { clubId, nom: 'Encadrant Inactif', active: false }, ['encadrant']);
    try {
      const db = await getDb();

      const byId = await findAssignablePerson(db, clubId, 'encadrant', { personId: inactive.user.id });
      expect(byId).toBeNull();

      const byName = await findAssignablePerson(db, clubId, 'encadrant', { personNom: inactive.user.nom });
      expect(byName).toBeNull();

      // Un dirigeant actif avec la même fonction reste bien assignable.
      const activeById = await findAssignablePerson(db, clubId, 'encadrant', { personId: active.user.id });
      expect(activeById?.id).toBe(active.user.id);
    } finally {
      await active.cleanup();
      await inactive.cleanup();
    }
  });
});
