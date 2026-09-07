import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { DELETE, GET, POST } from './route';

const dbAvailable = await isDbAvailable();

function authedRequest(method: string, token: string, url = 'http://localhost/api/planning/event-templates', body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { cookie: `session_token=${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe.skipIf(!dbAvailable)('/api/planning/event-templates (issue #188)', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/planning/event-templates'));
    expect(response.status).toBe(401);
  });

  it('rejects a template with an invalid event type', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(authedRequest('POST', token, undefined, {
        name: 'Test',
        eventType: 'officiel',
        fields: {},
      }));
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('strips fields not allowed for the event type', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let templateId: string | null = null;
    try {
      const response = await POST(authedRequest('POST', token, undefined, {
        name: 'Entraînement U13',
        eventType: 'entrainement',
        fields: {
          lieu: 'Terrain A',
          categorie: 'U13',
          durationMinutes: 90,
          encadrants: [{ nom: 'Coach', personId: 42 }],
          // Champ étranger au type entrainement : ne doit pas survivre.
          competition: 'Ne devrait pas être conservé',
        },
      }));
      expect(response.status).toBe(200);
      const created = await response.json();
      templateId = created.template.id;
      expect(created.template.fields).toEqual({
        lieu: 'Terrain A',
        categorie: 'U13',
        durationMinutes: 90,
        encadrants: [{ nom: 'Coach', personId: 42 }],
      });
    } finally {
      if (templateId) await DELETE(authedRequest('DELETE', token, `http://localhost/api/planning/event-templates?id=${templateId}`));
      await cleanup();
    }
  });

  it('lists and deletes a template, visible club-wide across admins', async () => {
    const clubId = 'test-club-templates';
    const admin1 = await createTestUserAndSession('admin', { clubId });
    const admin2 = await createTestUserAndSession('admin', { clubId });
    let templateId: string | null = null;
    try {
      const createResponse = await POST(authedRequest('POST', admin1.token, undefined, {
        name: 'Plateau U9',
        eventType: 'plateau',
        fields: { lieu: 'Gymnase', categories: ['U9'], durationMinutes: 120 },
      }));
      expect(createResponse.status).toBe(200);
      templateId = (await createResponse.json()).template.id;

      const listAsAdmin2 = await GET(authedRequest('GET', admin2.token));
      expect(listAsAdmin2.status).toBe(200);
      const list = await listAsAdmin2.json();
      expect(list.templates.some((tpl: { id: string }) => tpl.id === templateId)).toBe(true);

      const deleteResponse = await DELETE(authedRequest('DELETE', admin2.token, `http://localhost/api/planning/event-templates?id=${templateId}`));
      expect(deleteResponse.status).toBe(200);
      templateId = null;

      const finalList = await (await GET(authedRequest('GET', admin1.token))).json();
      expect(finalList.templates).toHaveLength(0);
    } finally {
      if (templateId) await DELETE(authedRequest('DELETE', admin1.token, `http://localhost/api/planning/event-templates?id=${templateId}`));
      await admin2.cleanup();
      await admin1.cleanup();
    }
  });
});
