import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { DELETE, GET, POST } from './route';

const dbAvailable = await isDbAvailable();

function authedRequest(method: string, token: string, url = 'http://localhost/api/planning/saved-filters', body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { cookie: `session_token=${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe.skipIf(!dbAvailable)('/api/planning/saved-filters (issue #189)', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/planning/saved-filters'));
    expect(response.status).toBe(401);
  });

  it('saves, lists, and deletes a filter scoped to its owner', async () => {
    const owner = await createTestUserAndSession('admin');
    const otherAdmin = await createTestUserAndSession('admin', { clubId: owner.user.clubId });
    let filterId: string | null = null;

    try {
      const createResponse = await POST(authedRequest('POST', owner.token, undefined, {
        name: 'Officiels à venir',
        filters: { clubSearch: 'AFP', arbitreAFPSearch: '', venue: 'domicile', eventType: 'officiel' },
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      filterId = created.filter.id;
      expect(created.filter.name).toBe('Officiels à venir');

      const listResponse = await GET(authedRequest('GET', owner.token));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json();
      expect(list.filters).toHaveLength(1);
      expect(list.filters[0]).toMatchObject({ id: filterId, name: 'Officiels à venir' });

      // Un autre administrateur du même club ne voit pas les filtres personnels du premier.
      const otherListResponse = await GET(authedRequest('GET', otherAdmin.token));
      expect((await otherListResponse.json()).filters).toHaveLength(0);

      // Il ne peut pas non plus le supprimer.
      const foreignDeleteResponse = await DELETE(authedRequest('DELETE', otherAdmin.token, `http://localhost/api/planning/saved-filters?id=${filterId}`));
      expect(foreignDeleteResponse.status).toBe(404);

      const deleteResponse = await DELETE(authedRequest('DELETE', owner.token, `http://localhost/api/planning/saved-filters?id=${filterId}`));
      expect(deleteResponse.status).toBe(200);
      filterId = null;

      const finalListResponse = await GET(authedRequest('GET', owner.token));
      expect((await finalListResponse.json()).filters).toHaveLength(0);
    } finally {
      if (filterId) {
        await DELETE(authedRequest('DELETE', owner.token, `http://localhost/api/planning/saved-filters?id=${filterId}`));
      }
      await otherAdmin.cleanup();
      await owner.cleanup();
    }
  });

  it('rejects a filter without a name', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(authedRequest('POST', token, undefined, {
        name: '',
        filters: { clubSearch: '', arbitreAFPSearch: '', venue: 'all', eventType: 'all' },
      }));
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });
});
