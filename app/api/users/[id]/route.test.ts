import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { NotificationEntity } from '@/lib/db/schemas';
import { PUT } from './route';
import { POST as postEntrainement } from '@/app/api/entrainements/route';

const dbAvailable = await isDbAvailable();

function putRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest('http://localhost/api/users/1', {
    method: 'PUT',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('PUT /api/users/[id] — alerte de désactivation (issue #206)', () => {
  it("notifie les administrateurs quand un dirigeant désactivé a une affectation future", async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('dirigeant', { clubId, nom: `Encadrant Futur ${randomBytes(3).toString('hex')}` }, ['encadrant']);
    let draftId: string | null = null;

    try {
      const db = await getDb();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const dateStr = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;

      const createResponse = await postEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          time: '10:00',
          lieu: 'Terrain futur',
          categorie: 'U13',
          encadrants: [{ nom: encadrant.user.nom, numero: '' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      draftId = created.entrainement?.id ?? null;
      // L'encadrant doit avoir été résolu par nom (personId lié), sinon le test ne prouve rien.
      expect(created.entrainement?.encadrants?.[0]?.personId).toBe(encadrant.user.id);

      const putResponse = await PUT(
        putRequest({ active: false }, admin.token),
        { params: { id: String(encadrant.user.id) } },
      );
      expect(putResponse.status).toBe(200);

      const adminNotifications = await db.getRepository<NotificationEntity>('Notification').find({ where: { userId: admin.user.id } });
      expect(adminNotifications.some((n) => n.type === 'user-deactivated-with-assignments')).toBe(true);
    } finally {
      const db = await getDb();
      if (draftId) {
        await db.getRepository('Entrainement').delete({ id: draftId });
        await db.getRepository('MatchAuditLog').delete({ entityId: draftId });
      }
      await db.getRepository('Notification').delete({ userId: admin.user.id });
      await admin.cleanup();
      await encadrant.cleanup();
    }
  });

  it("ne notifie personne quand le dirigeant désactivé n'a aucune affectation future", async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);

    try {
      const db = await getDb();

      const putResponse = await PUT(
        putRequest({ active: false }, admin.token),
        { params: { id: String(encadrant.user.id) } },
      );
      expect(putResponse.status).toBe(200);

      const adminNotifications = await db.getRepository<NotificationEntity>('Notification').find({ where: { userId: admin.user.id } });
      expect(adminNotifications.some((n) => n.type === 'user-deactivated-with-assignments')).toBe(false);
    } finally {
      const db = await getDb();
      await db.getRepository('Notification').delete({ userId: admin.user.id });
      await admin.cleanup();
      await encadrant.cleanup();
    }
  });
});
