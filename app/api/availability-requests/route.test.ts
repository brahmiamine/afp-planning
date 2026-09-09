import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { NotificationEntity } from '@/lib/db/schemas';
import { GET, POST, DELETE } from './route';

const dbAvailable = await isDbAvailable();

function getRequest(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

function postRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest('http://localhost/api/availability-requests', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(id: string, token: string) {
  return new NextRequest(`http://localhost/api/availability-requests?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { cookie: `session_token=${token}` },
  });
}

describe.skipIf(!dbAvailable)('GET/POST/DELETE /api/availability-requests (issue #155)', () => {
  it('rejects an unauthenticated GET and a non-admin POST', async () => {
    const getResponse = await GET(new NextRequest('http://localhost/api/availability-requests'));
    expect(getResponse.status).toBe(401);

    // Club isolé pour ne pas dépendre de rôles laissés par d'autres tests parallèles.
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const encadrant = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    try {
      const postResponse = await POST(postRequest({
        title: 'Vacances de printemps',
        startDate: '2027-04-01',
        endDate: '2027-04-15',
        targetRoles: ['encadrant'],
      }, encadrant.token));
      expect(postResponse.status).toBe(403);
    } finally {
      await encadrant.cleanup();
    }
  });

  it('rejects an invalid campaign payload', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    try {
      const response = await POST(postRequest({
        title: '',
        startDate: '2027-04-01',
        endDate: '2027-04-15',
        targetRoles: ['encadrant'],
      }, admin.token));
      expect(response.status).toBe(400);

      const reversedRange = await POST(postRequest({
        title: 'Dates inversées',
        startDate: '2027-04-15',
        endDate: '2027-04-01',
        targetRoles: ['encadrant'],
      }, admin.token));
      expect(reversedRange.status).toBe(400);

      const noTargetRoles = await POST(postRequest({
        title: 'Sans cible',
        startDate: '2027-04-01',
        endDate: '2027-04-15',
        targetRoles: [],
      }, admin.token));
      expect(noTargetRoles.status).toBe(400);
    } finally {
      await admin.cleanup();
    }
  });

  it('creates a campaign visible only to targeted field roles, notifies them, then deletes it with its responses', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const targetedEncadrant = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const untargetedArbitre = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    let requestId: string | null = null;

    try {
      const db = await getDb();

      const createResponse = await POST(postRequest({
        title: 'Disponibilités été',
        startDate: '2027-06-01',
        endDate: '2027-06-30',
        targetRoles: ['encadrant'],
        message: 'Merci de répondre avant le 15 mai',
      }, admin.token));
      expect(createResponse.status).toBe(200);
      const createBody = await createResponse.json();
      requestId = createBody.request.id as string;
      expect(createBody.request.targetRoles).toEqual(['encadrant']);

      // L'encadrant ciblé reçoit une notification ; l'arbitre non ciblé n'en reçoit pas.
      const encadrantNotifications = await db.getRepository<NotificationEntity>('Notification').find({ where: { userId: targetedEncadrant.user.id } });
      expect(encadrantNotifications.some((n) => n.type === 'availability-request')).toBe(true);
      const arbitreNotifications = await db.getRepository<NotificationEntity>('Notification').find({ where: { userId: untargetedArbitre.user.id } });
      expect(arbitreNotifications.some((n) => n.type === 'availability-request')).toBe(false);

      // Vue admin : voit toutes les campagnes avec les réponses.
      const adminList = await GET(getRequest('http://localhost/api/availability-requests', admin.token));
      const adminBody = await adminList.json();
      expect(adminBody.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      // Vue personnelle ciblée : la campagne est visible.
      const encadrantList = await GET(getRequest('http://localhost/api/availability-requests', targetedEncadrant.token));
      const encadrantBody = await encadrantList.json();
      expect(encadrantBody.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      // Vue personnelle non ciblée : la campagne n'apparaît pas.
      const arbitreList = await GET(getRequest('http://localhost/api/availability-requests', untargetedArbitre.token));
      const arbitreBody = await arbitreList.json();
      expect(arbitreBody.requests.some((r: { id: string }) => r.id === requestId)).toBe(false);

      // Suppression : réservée aux admins, supprime la campagne.
      const forbiddenDelete = await DELETE(deleteRequest(requestId, targetedEncadrant.token));
      expect(forbiddenDelete.status).toBe(403);

      const deleteResponse = await DELETE(deleteRequest(requestId, admin.token));
      expect(deleteResponse.status).toBe(200);

      const afterDelete = await GET(getRequest('http://localhost/api/availability-requests', admin.token));
      const afterDeleteBody = await afterDelete.json();
      expect(afterDeleteBody.requests.some((r: { id: string }) => r.id === requestId)).toBe(false);
    } finally {
      const db = await getDb();
      if (requestId) await db.query('DELETE FROM planning_records WHERE id = ?', [requestId]);
      await db.getRepository('Notification').delete({ userId: targetedEncadrant.user.id });
      await db.getRepository('Notification').delete({ userId: untargetedArbitre.user.id });
      await targetedEncadrant.cleanup();
      await untargetedArbitre.cleanup();
      await admin.cleanup();
    }
  });
});
