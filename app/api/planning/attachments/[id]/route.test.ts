import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PlanningEventSnapshot } from '@/lib/planning/event-store';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getDb: vi.fn(),
  getPlanningAttachment: vi.fn(),
  deletePlanningAttachment: vi.fn(),
  resolvePlanningEventForAccess: vi.fn(),
  getPlanningEventSnapshot: vi.fn(),
}));

vi.mock('@/lib/auth/require', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/db/audit-log', () => ({ logAuditEntry: vi.fn() }));
vi.mock('@/lib/planning/records', () => ({
  getPlanningAttachment: mocks.getPlanningAttachment,
  deletePlanningAttachment: mocks.deletePlanningAttachment,
}));
vi.mock('@/lib/planning/event-access', () => ({
  canManagePlanningEventWorkspace: () => false,
  canReadPlanningEventWorkspace: () => true,
  resolvePlanningEventForAccess: mocks.resolvePlanningEventForAccess,
}));
vi.mock('@/lib/planning/event-store', () => ({
  getPlanningEventSnapshot: mocks.getPlanningEventSnapshot,
}));

const { GET } = await import('./route');

const publishedSnapshot = {
  eventId: 'match-1',
  eventType: 'amical',
  title: 'AFP – Visiteur',
  date: '12/09/2026',
  time: '15:00',
  durationMinutes: 90,
  location: 'Stade AFP',
  planningStatus: 'published',
  event: { id: 'match-1', type: 'amical', date: '12/09/2026', time: '15:00' },
  extras: { id: 'match-1' },
  assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
} as unknown as PlanningEventSnapshot;

describe('GET /api/planning/attachments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      user: {
        id: 7,
        clubId: 'afp',
        email: 'arbitre@example.com',
        nom: 'Arbitre',
        accessRole: 'dirigeant',
        planningFunctions: ['arbitre_club'],
        role: 'arbitre',
      },
    });
    mocks.getDb.mockResolvedValue({});
    mocks.getPlanningAttachment.mockResolvedValue({
      id: 'att-1',
      clubId: 'afp',
      eventType: 'amical',
      eventId: 'match-1',
      fileName: 'preuve.txt',
      mimeType: 'text/plain',
      sizeBytes: 3,
      content: Buffer.from('abc'),
      uploadedByUserId: 1,
      createdAt: new Date('2026-09-06T20:00:00.000Z'),
    });
    mocks.getPlanningEventSnapshot.mockResolvedValue(null);
    mocks.resolvePlanningEventForAccess.mockResolvedValue(publishedSnapshot);
  });

  it('autorise le téléchargement selon le snapshot publié même si le brouillon live a changé (issue #92)', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/planning/attachments/att-1'),
      { params: { id: 'att-1' } },
    );

    expect(response).toBeDefined();
    if (!response) throw new Error('Réponse HTTP attendue');
    expect(response.status).toBe(200);
    expect(mocks.resolvePlanningEventForAccess).toHaveBeenCalledWith({}, expect.objectContaining({ id: 7 }), 'amical', 'match-1');
    expect(Buffer.from(await response.arrayBuffer()).toString('utf8')).toBe('abc');
  });
});
