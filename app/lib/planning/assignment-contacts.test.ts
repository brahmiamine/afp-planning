import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

const notifyContact = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/notifications/service', () => ({
  notifyContact: (...args: unknown[]) => notifyContact(...args),
}));

import { contactIdentity, diffAssignmentContacts, notifyAssignmentChanges } from './assignment-contacts';

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

describe('notifyAssignmentChanges — urgence (issue #217)', () => {
  it('marque un retrait comme critique et un ajout comme normal', async () => {
    notifyContact.mockClear();
    const before = [{ nom: 'Sortant', numero: '', personId: 1, personType: 'encadrant' as const }];
    const after = [{ nom: 'Entrant', numero: '', personId: 2, personType: 'encadrant' as const }];

    await notifyAssignmentChanges({} as DataSource, before, after, {
      eventType: 'amical',
      eventId: 'm-1',
      roleLabel: 'Encadrant',
      eventLabel: 'Match test',
    });

    expect(notifyContact).toHaveBeenCalledTimes(2);
    const inputByName = new Map(
      notifyContact.mock.calls.map((call) => {
        const [, contact, input] = call as [unknown, { nom: string }, { urgency?: string }];
        return [contact.nom, input.urgency] as const;
      }),
    );
    expect(inputByName.get('Sortant')).toBe('critical');
    expect(inputByName.get('Entrant')).toBeUndefined();
  });
});
