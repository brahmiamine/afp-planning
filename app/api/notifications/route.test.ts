import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { NotificationEntity } from '@/lib/db/schemas';
import { GET, PATCH } from './route';

const dbAvailable = await isDbAvailable();

function getRequest(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

function patchRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest('http://localhost/api/notifications', {
    method: 'PATCH',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function makeNotification(userId: number, readAt: Date | null = null) {
  const db = await getDb();
  const repo = db.getRepository<NotificationEntity>('Notification');
  const saved = await repo.save({
    userId,
    type: 'test',
    title: 'Titre',
    message: 'Message',
    eventType: null,
    eventId: null,
    readAt,
  });
  return saved;
}

describe.skipIf(!dbAvailable)('GET/PATCH /api/notifications (issue #155)', () => {
  it('rejects an unauthenticated request', async () => {
    const getResponse = await GET(new NextRequest('http://localhost/api/notifications'));
    expect(getResponse.status).toBe(401);
    const patchResponse = await PATCH(new NextRequest('http://localhost/api/notifications', { method: 'PATCH', body: '{}' }));
    expect(patchResponse.status).toBe(401);
  });

  it('lists only the caller’s notifications with an accurate unread count', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const owner = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const other = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const unread = await makeNotification(owner.user.id);
    const read = await makeNotification(owner.user.id, new Date());
    const notMine = await makeNotification(other.user.id);

    try {
      const response = await GET(getRequest('http://localhost/api/notifications', owner.token));
      expect(response.status).toBe(200);
      const body = await response.json();
      const ids = (body.notifications as Array<{ id: number }>).map((n) => n.id);
      expect(ids).toContain(unread.id);
      expect(ids).toContain(read.id);
      expect(ids).not.toContain(notMine.id);
      expect(body.unread).toBe(1);
    } finally {
      const db = await getDb();
      await db.getRepository('Notification').delete({ id: unread.id });
      await db.getRepository('Notification').delete({ id: read.id });
      await db.getRepository('Notification').delete({ id: notMine.id });
      await owner.cleanup();
      await other.cleanup();
    }
  });

  it('counts all unread notifications even when more than 100 exist', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const owner = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const createdIds: number[] = [];

    try {
      for (let i = 0; i < 101; i += 1) {
        const row = await makeNotification(owner.user.id);
        createdIds.push(row.id);
      }

      const response = await GET(getRequest('http://localhost/api/notifications', owner.token));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect((body.notifications as unknown[]).length).toBeLessThanOrEqual(100);
      expect(body.unread).toBe(101);
    } finally {
      const db = await getDb();
      for (const id of createdIds) {
        await db.getRepository('Notification').delete({ id });
      }
      await owner.cleanup();
    }
  });

  it('marks a single notification as read but refuses one owned by another user', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const owner = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const other = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const notification = await makeNotification(owner.user.id);

    try {
      const forbidden = await PATCH(patchRequest({ id: notification.id }, other.token));
      expect(forbidden.status).toBe(404);

      const response = await PATCH(patchRequest({ id: notification.id }, owner.token));
      expect(response.status).toBe(200);

      const db = await getDb();
      const updated = await db.getRepository<NotificationEntity>('Notification').findOneBy({ id: notification.id });
      expect(updated?.readAt).not.toBeNull();
    } finally {
      const db = await getDb();
      await db.getRepository('Notification').delete({ id: notification.id });
      await owner.cleanup();
      await other.cleanup();
    }
  });

  it('marks all of the caller’s unread notifications as read in one call', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const owner = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const first = await makeNotification(owner.user.id);
    const second = await makeNotification(owner.user.id);

    try {
      const response = await PATCH(patchRequest({ all: true }, owner.token));
      expect(response.status).toBe(200);

      const db = await getDb();
      const repo = db.getRepository<NotificationEntity>('Notification');
      expect((await repo.findOneBy({ id: first.id }))?.readAt).not.toBeNull();
      expect((await repo.findOneBy({ id: second.id }))?.readAt).not.toBeNull();

      const listResponse = await GET(getRequest('http://localhost/api/notifications', owner.token));
      const listBody = await listResponse.json();
      expect(listBody.unread).toBe(0);
    } finally {
      const db = await getDb();
      await db.getRepository('Notification').delete({ id: first.id });
      await db.getRepository('Notification').delete({ id: second.id });
      await owner.cleanup();
    }
  });
});
