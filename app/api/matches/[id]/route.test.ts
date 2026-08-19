import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET, PUT } from './route';

const dbAvailable = await isDbAvailable();

function matchRequest(method: string, token: string | undefined, matchId: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/matches/${matchId}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(token ? { cookie: `session_token=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

describe.skipIf(!dbAvailable)('/api/matches/[id] (integration)', () => {
  const matchId = `test-match-${Date.now()}`;

  afterEach(async () => {
    const db = await getDb();
    await db.getRepository('MatchExtra').delete({ matchId });
    await db.getRepository('MatchAuditLog').delete({ entityId: matchId });
  });

  it('updates match extras as admin and logs an audit entry', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await PUT(
        matchRequest('PUT', token, matchId, { confirmed: true, arbitreTouche: [{ nom: 'Jean Dupont', numero: '0600000000' }] }),
        { params: { id: matchId } },
      );
      expect(response.status).toBe(200);

      const db = await getDb();
      const auditRows = await db.getRepository('MatchAuditLog').find({ where: { entityId: matchId } });
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0]?.entityType).toBe('MatchExtra');

      const getResponse = await GET(matchRequest('GET', token, matchId), { params: { id: matchId } });
      const extras = await getResponse.json();
      expect(extras.confirmed).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('rejects an update from a read-only role', async () => {
    const { token, cleanup } = await createTestUserAndSession('encadrant');
    try {
      const response = await PUT(matchRequest('PUT', token, matchId, { confirmed: true }), { params: { id: matchId } });
      expect(response.status).toBe(403);
    } finally {
      await cleanup();
    }
  });
});
