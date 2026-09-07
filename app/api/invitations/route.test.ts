import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { InvitationEntity } from '@/lib/db/schemas';
import { GET, POST } from './route';

const dbAvailable = await isDbAvailable();

function getRequest(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

function postRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest('http://localhost/api/invitations', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('GET/POST /api/invitations (issue #155)', () => {
  it('rejects non-admin access and an invalid role', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const encadrant = await createTestUserAndSession('encadrant', { clubId });
    const admin = await createTestUserAndSession('admin', { clubId });
    try {
      const getResponse = await GET(getRequest('http://localhost/api/invitations', encadrant.token));
      expect(getResponse.status).toBe(403);

      const postResponse = await POST(postRequest({ email: 'nouveau@example.com', role: 'encadrant' }, encadrant.token));
      expect(postResponse.status).toBe(403);

      const invalidRole = await POST(postRequest({ email: 'nouveau@example.com', role: 'superadmin' }, admin.token));
      expect(invalidRole.status).toBe(400);
    } finally {
      await encadrant.cleanup();
      await admin.cleanup();
    }
  });

  it('creates an invitation scoped to the admin club and lists only that club’s invitations', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const otherClubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const otherAdmin = await createTestUserAndSession('admin', { clubId: otherClubId });
    let invitationId: string | null = null;

    try {
      const db = await getDb();

      const createResponse = await POST(postRequest({
        email: 'Nouveau.Encadrant@Example.com',
        role: 'encadrant',
        personNom: 'Nouveau Encadrant',
        expiresInDays: 3,
      }, admin.token));
      expect(createResponse.status).toBe(200);
      const createBody = await createResponse.json();
      invitationId = createBody.invitation.id as string;
      // L'email est normalisé (minuscules) avant stockage.
      expect(createBody.invitation.email).toBe('nouveau.encadrant@example.com');
      expect(createBody.url).toBe(`/inscription/${invitationId}`);

      const stored = await db.getRepository<InvitationEntity>('Invitation').findOneBy({ id: invitationId });
      expect(stored?.clubId).toBe(clubId);

      const adminList = await GET(getRequest('http://localhost/api/invitations', admin.token));
      const adminBody = await adminList.json();
      expect(adminBody.invitations.some((inv: { id: string }) => inv.id === invitationId)).toBe(true);

      // L'admin d'un autre club ne voit pas cette invitation (frontière multi-tenant).
      const otherList = await GET(getRequest('http://localhost/api/invitations', otherAdmin.token));
      const otherBody = await otherList.json();
      expect(otherBody.invitations.some((inv: { id: string }) => inv.id === invitationId)).toBe(false);
    } finally {
      const db = await getDb();
      if (invitationId) await db.getRepository('Invitation').delete({ id: invitationId });
      await admin.cleanup();
      await otherAdmin.cleanup();
    }
  });
});
