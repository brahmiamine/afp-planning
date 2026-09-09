import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PlanningEventSnapshot } from '@/lib/planning/event-store';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDb: vi.fn(),
  logAuditEntry: vi.fn(),
  buildAssignmentSuggestions: vi.fn(),
  enrichAssignmentContacts: vi.fn(),
  notifyAssignmentChanges: vi.fn(),
  getPlanningEventSnapshot: vi.fn(),
  saveRoleAssignments: vi.fn(),
  savePlanningPublication: vi.fn(),
  deletePlanningRecord: vi.fn(),
  listPlanningRecords: vi.fn(),
  savePlanningRecord: vi.fn(),
  findAssignablePerson: vi.fn(),
  setCurrentClubId: vi.fn(),
  isPlanningEventCurrentlyPublished: vi.fn(),
}));

vi.mock('@/lib/auth/require', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/db/audit-log', () => ({ logAuditEntry: mocks.logAuditEntry }));
vi.mock('@/lib/planning/assignment-suggestions', () => ({ buildAssignmentSuggestions: mocks.buildAssignmentSuggestions }));
vi.mock('@/lib/planning/assignment-contacts', () => ({
  enrichAssignmentContacts: mocks.enrichAssignmentContacts,
  notifyAssignmentChanges: mocks.notifyAssignmentChanges,
}));
vi.mock('@/lib/planning/person-link', () => ({ findAssignablePerson: mocks.findAssignablePerson }));
vi.mock('@/lib/planning/event-store', () => ({
  getPlanningEventSnapshot: mocks.getPlanningEventSnapshot,
  saveRoleAssignments: mocks.saveRoleAssignments,
  savePlanningPublication: mocks.savePlanningPublication,
}));
vi.mock('@/lib/planning/records', () => ({
  deletePlanningRecord: mocks.deletePlanningRecord,
  listPlanningRecords: mocks.listPlanningRecords,
  savePlanningRecord: mocks.savePlanningRecord,
}));
vi.mock('@/lib/planning/event-lifecycle', () => ({
  isPlanningEventCurrentlyPublished: mocks.isPlanningEventCurrentlyPublished,
}));
vi.mock('@/lib/auth/club-context', () => ({ setCurrentClubId: mocks.setCurrentClubId }));

import { POST } from './route';

const user = {
  id: 7,
  clubId: 'club-test',
  accessRole: 'admin',
  planningFunctions: [],
  email: 'admin@example.com',
  nom: 'Admin',
};

const snapshot: PlanningEventSnapshot = {
  eventId: 'evt-1',
  eventType: 'entrainement',
  title: 'Entraînement',
  date: '20/09/2026',
  time: '10:00',
  durationMinutes: 90,
  location: 'Terrain A',
  planningStatus: 'published',
  event: {
    id: 'evt-1',
    type: 'entrainement',
    date: '20/09/2026',
    time: '10:00',
    lieu: 'Terrain A',
    encadrants: [],
    planningStatus: 'published',
  },
  extras: null,
  assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
  revision: 0,
};

const candidate = {
  personId: 42,
  personType: 'encadrant',
  nom: 'Candidate',
  telephone: '0600000000',
};

const waitlistRecord = {
  id: 'waitlist:evt-1:42',
  clubId: 'club-test',
  kind: 'waitlist',
  eventType: 'entrainement',
  eventId: 'evt-1',
  ownerUserId: null,
  personType: 'encadrant',
  personId: 42,
  payload: {
    role: 'encadrant',
    personType: 'encadrant',
    personId: 42,
    nom: 'Candidate',
    telephone: '0600000000',
    rank: 1,
    addedAt: '2026-09-07T12:00:00.000Z',
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

function request() {
  return new NextRequest('http://localhost/api/planning/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'promote', recordId: waitlistRecord.id }),
  });
}

describe('POST /api/planning/waitlist promote — brouillon (issue #146)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ user });
    mocks.listPlanningRecords.mockResolvedValue([waitlistRecord]);
    mocks.getPlanningEventSnapshot.mockResolvedValue(snapshot);
    mocks.buildAssignmentSuggestions.mockResolvedValue([candidate]);
    mocks.enrichAssignmentContacts.mockResolvedValue([{
      nom: candidate.nom,
      numero: candidate.telephone,
      personId: candidate.personId,
      personType: candidate.personType,
      status: 'pending',
    }]);
    mocks.deletePlanningRecord.mockResolvedValue(true);
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValue(true);

    const manager = { tx: true };
    mocks.getDb.mockResolvedValue({
      transaction: vi.fn(async (work: (manager: unknown) => Promise<unknown>) => work(manager)),
    });
  });

  it('enregistre la promotion sans notifier avant publication et retire la waitlist dans la même transaction', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    const db = await mocks.getDb.mock.results[0]?.value;
    expect(db.transaction).toHaveBeenCalledTimes(1);

    const manager = { tx: true };
    const saveCall = mocks.saveRoleAssignments.mock.calls[0];
    const deleteCall = mocks.deletePlanningRecord.mock.calls[0];
    expect(saveCall?.[0]).toMatchObject(manager);
    expect(deleteCall?.[0]).toBe(saveCall?.[0]);
    expect(mocks.savePlanningPublication).toHaveBeenCalledWith(
      saveCall?.[0],
      expect.objectContaining({ eventId: 'evt-1' }),
      expect.objectContaining({ planningStatus: 'modified' }),
    );
    expect(mocks.notifyAssignmentChanges).not.toHaveBeenCalled();
  });

  it('ne marque pas modified avant la première publication globale', async () => {
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValueOnce(false);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.savePlanningPublication).not.toHaveBeenCalled();
    expect(mocks.notifyAssignmentChanges).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ publicationRequired: false });
  });

  it('ne supprime pas la waitlist si l’écriture de l’affectation échoue', async () => {
    mocks.saveRoleAssignments.mockRejectedValueOnce(new Error('échec simulé'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.deletePlanningRecord).not.toHaveBeenCalled();
    expect(mocks.notifyAssignmentChanges).not.toHaveBeenCalled();
  });
});
