import { randomBytes } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { InvitationEntity } from '@/lib/db/schemas';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function acceptRequest(token: string, body: unknown) {
  return new NextRequest(`http://localhost/api/invitations/${token}/accept`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createInvitation(overrides?: Partial<InvitationEntity>) {
  const db = await getDb();
  const repo = db.getRepository<InvitationEntity>('Invitation');
  return repo.save({
    id: randomBytes(24).toString('hex'),
    clubId: process.env.APP_CLUB_ID || 'afp',
    email: null,
    role: 'arbitre',
    personNom: null,
    createdByUserId: 0,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    usedAt: null,
    usedByUserId: null,
    ...overrides,
  });
}

describe.skipIf(!dbAvailable)('POST /api/invitations/[token]/accept (integration)', () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    const db = await getDb();
    if (createdEmails.length > 0) {
      await db.getRepository('User').createQueryBuilder().delete().where('email IN (:...emails)', { emails: createdEmails }).execute();
      createdEmails.length = 0;
    }
  });

  it('creates a user and logs them in for a valid unused token', async () => {
    const invitation = await createInvitation({ role: 'admin' });
    const email = `invitee-${randomBytes(8).toString('hex')}@example.com`;
    createdEmails.push(email);

    const response = await POST(acceptRequest(invitation.id, { email, password: 'password123', nom: 'Invitee' }), {
      params: { token: invitation.id },
    });

    expect(response.status).toBe(200);
    expect(response.cookies.get('session_token')?.value).toBeTruthy();
  });

  it('rejects an expired invitation', async () => {
    const invitation = await createInvitation({ expiresAt: new Date(Date.now() - 1000) });
    const response = await POST(
      acceptRequest(invitation.id, { email: `expired-${Date.now()}@example.com`, password: 'password123', nom: 'X' }),
      { params: { token: invitation.id } },
    );
    expect(response.status).toBe(410);
  });

  it('rejects an already-used invitation', async () => {
    const invitation = await createInvitation({ usedAt: new Date() });
    const response = await POST(
      acceptRequest(invitation.id, { email: `used-${Date.now()}@example.com`, password: 'password123', nom: 'X' }),
      { params: { token: invitation.id } },
    );
    expect(response.status).toBe(409);
  });

  it('rejects an unknown token', async () => {
    const response = await POST(
      acceptRequest('nonexistent-token', { email: `x-${Date.now()}@example.com`, password: 'password123', nom: 'X' }),
      { params: { token: 'nonexistent-token' } },
    );
    expect(response.status).toBe(404);
  });
});
