import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { savePlanningRecord } from '@/lib/planning/records';
import { POST } from './route';

const dbAvailable = await isDbAvailable();
const runId = `avail-closure-${Date.now()}`;
const clubId = `${runId}-club`;

function respondRequest(token: string, campaignId: string) {
  return new NextRequest(`http://localhost/api/availability-requests/${campaignId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ status: 'available', availableFrom: null, availableUntil: null, comment: null }),
    headers: {
      cookie: `session_token=${token}`,
      'Content-Type': 'application/json',
    },
  });
}

async function seedCampaign(id: string, overrides: { closesAt?: string | null; endDate?: string } = {}) {
  const db = await getDb();
  await savePlanningRecord(db, {
    id,
    clubId,
    kind: 'availability-request',
    payload: {
      title: `Campagne ${id}`,
      startDate: '2026-09-01',
      endDate: overrides.endDate ?? '2099-12-31',
      targetRoles: ['arbitre_club'],
      message: null,
      createdByUserId: 1,
      closesAt: overrides.closesAt ?? null,
    },
  });
}

describe.skipIf(!dbAvailable)('/api/availability-requests/[id]/respond clôture (issue #87)', () => {
  afterEach(async () => {
    const db = await getDb();
    // Le club de test est dédié à cette suite : le nettoyage ne touche aucune autre donnée.
    await db.query(
      'DELETE FROM planning_records WHERE club_id = ? AND kind IN (?, ?)',
      [clubId, 'availability-request', 'availability-response'],
    );
  });

  it('refuse une réponse lorsque closesAt est passé', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const campaignId = `availability-request:${runId}:closed-at`;
    await seedCampaign(campaignId, { closesAt: '2020-01-01T00:00:00.000Z' });
    try {
      const response = await POST(respondRequest(token, campaignId), { params: Promise.resolve({ id: campaignId }) });
      expect(response.status).toBe(409);
    } finally {
      await cleanup();
    }
  });

  it('refuse une réponse sans closesAt lorsque la période est terminée', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const campaignId = `availability-request:${runId}:period-over`;
    await seedCampaign(campaignId, { endDate: '2020-01-31' });
    try {
      const response = await POST(respondRequest(token, campaignId), { params: Promise.resolve({ id: campaignId }) });
      expect(response.status).toBe(409);
    } finally {
      await cleanup();
    }
  });

  it('accepte une réponse sans closesAt lorsque la période est en cours', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const campaignId = `availability-request:${runId}:open`;
    await seedCampaign(campaignId);
    try {
      const response = await POST(respondRequest(token, campaignId), { params: Promise.resolve({ id: campaignId }) });
      expect(response.status).toBe(200);
    } finally {
      await cleanup();
    }
  });
});
