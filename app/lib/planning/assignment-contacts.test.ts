import { describe, expect, it } from 'vitest';
import { contactIdentity, diffAssignmentContacts } from './assignment-contacts';

describe('contactIdentity', () => {
  it('uses stable person type/id when available', () => {
    expect(contactIdentity({
      nom: 'Jean Dupont',
      numero: '',
      personId: 7,
      personType: 'officiel',
    })).toBe('officiel:7');
  });

  it('falls back to normalized name for legacy contacts', () => {
    expect(contactIdentity({ nom: '  Jean Dupont ', numero: '' })).toBe('name:jean dupont');
  });
});

describe('diffAssignmentContacts', () => {
  it('detects additions/removals without treating a renamed stable person as different', () => {
    const before = [
      { nom: 'Ancien nom', numero: '', personId: 7, personType: 'officiel' as const, status: 'accepted' as const },
      { nom: 'Marie', numero: '', personId: 8, personType: 'officiel' as const },
    ];
    const after = [
      { nom: 'Nouveau nom', numero: '', personId: 7, personType: 'officiel' as const, status: 'accepted' as const },
      { nom: 'Paul', numero: '', personId: 9, personType: 'officiel' as const },
    ];

    const diff = diffAssignmentContacts(before, after);
    expect(diff.added.map((item) => item.personId)).toEqual([9]);
    expect(diff.removed.map((item) => item.personId)).toEqual([8]);
  });
});
