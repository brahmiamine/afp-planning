import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { DELETE, GET, POST } from './route';

const dbAvailable = await isDbAvailable();

function authedRequest(method: string, token: string, url = 'http://localhost/api/planning/shares', body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { cookie: `session_token=${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe.skipIf(!dbAvailable)('/api/planning/shares (issue #155)', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/planning/shares'));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid date range', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(authedRequest('POST', token, undefined, {
        fromDate: '2026-09-20',
        toDate: '2026-09-10',
      }));
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('creates a share token, lists it, then deletes it', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let shareId: string | null = null;
    try {
      const createResponse = await POST(authedRequest('POST', token, undefined, { expiryDays: 3 }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      shareId = created.share.id;
      expect(created.share.path).toMatch(/^\/partage\//);
      expect(typeof created.share.token).toBe('string');
      expect(created.share.token.length).toBeGreaterThan(10);

      const listResponse = await GET(authedRequest('GET', token));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json();
      expect(list.shares.some((share: { id: string }) => share.id === shareId)).toBe(true);
      // Le token en clair n'est jamais renvoyé une fois le partage créé.
      expect(list.shares.every((share: Record<string, unknown>) => !('token' in share))).toBe(true);

      const deleteResponse = await DELETE(authedRequest('DELETE', token, `http://localhost/api/planning/shares?id=${shareId}`));
      expect(deleteResponse.status).toBe(200);
      shareId = null;

      const finalList = await (await GET(authedRequest('GET', token))).json();
      expect(finalList.shares.some((share: { id: string }) => share.id === created.share.id)).toBe(false);
    } finally {
      if (shareId) {
        await DELETE(authedRequest('DELETE', token, `http://localhost/api/planning/shares?id=${shareId}`));
      }
      await cleanup();
    }
  });
});
