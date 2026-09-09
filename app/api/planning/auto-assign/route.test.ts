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
  isPlanningEventCurrentlyPublished: vi.fn(),
  planningFeatureGuard: vi.fn(),
  setCurrentClubId: vi.fn(),
}));

vi.mock('@/lib/auth/require', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/db/audit-log', () => ({ logAuditEntry: mocks.logAuditEntry }));
vi.mock('@/lib/planning/assignment-suggestions', () => ({ buildAssignmentSuggestions: mocks.buildAssignmentSuggestions }));
vi.mock('@/lib/planning/assignment-contacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planning/assignment-contacts')>();
  return {
    ...actual,
    enrichAssignmentContacts: mocks.enrichAssignmentContacts,
    notifyAssignmentChanges: mocks.notifyAssignmentChanges,
  };
});
vi.mock('@/lib/planning/event-store', () => ({
  getPlanningEventSnapshot: mocks.getPlanningEventSnapshot,
  saveRoleAssignments: mocks.saveRoleAssignments,
  savePlanningPublication: mocks.savePlanningPublication,
}));
vi.mock('@/lib/planning/event-lifecycle', () => ({
  isPlanningEventCurrentlyPublished: mocks.isPlanningEventCurrentlyPublished,
}));
vi.mock('@/lib/planning/feature-guard', () => ({ planningFeatureGuard: mocks.planningFeatureGuard }));
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
  personType: 'encadrant' as const,
  nom: 'Candidate',
  telephone: '0600000000',
  score: 100,
  load30Days: 0,
  upcomingLoad: 0,
  reasons: [],
};

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/planning/auto-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/planning/auto-assign — brouillon (issue #197)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ user });
    mocks.planningFeatureGuard.mockResolvedValue(null);
    mocks.getPlanningEventSnapshot.mockResolvedValue(snapshot);
    mocks.buildAssignmentSuggestions.mockResolvedValue([candidate]);
    mocks.enrichAssignmentContacts.mockResolvedValue([{
      nom: candidate.nom,
      numero: candidate.telephone,
      personId: candidate.personId,
      personType: candidate.personType,
      status: 'pending',
    }]);
    mocks.saveRoleAssignments.mockResolvedValue(1);
    mocks.getDb.mockResolvedValue({});
  });

  it('marque l’événement déjà publié `modified` au lieu de propager/notifier immédiatement', async () => {
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValue(true);

    const response = await POST(request({ eventType: 'entrainement', eventId: 'evt-1', role: 'encadrant' }));

    expect(response.status).toBe(200);
    expect(mocks.savePlanningPublication).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventId: 'evt-1' }),
      expect.objectContaining({ planningStatus: 'modified' }),
    );
    expect(mocks.notifyAssignmentChanges).not.toHaveBeenCalled();
  });

  it('ne marque rien avant la première publication globale', async () => {
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValue(false);

    const response = await POST(request({ eventType: 'entrainement', eventId: 'evt-1', role: 'encadrant' }));

    expect(response.status).toBe(200);
    expect(mocks.savePlanningPublication).not.toHaveBeenCalled();
    expect(mocks.notifyAssignmentChanges).not.toHaveBeenCalled();
  });
});
