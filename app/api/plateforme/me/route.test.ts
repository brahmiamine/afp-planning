import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { hashPassword } from '@/lib/auth/password';
import { createPlatformSession, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/auth/platform-session';
import { isEncryptionConfigured } from '@/lib/crypto/secret-box';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('GET /api/plateforme/me — visibilité du chiffrement (issue #212)', () => {
  it('expose isEncryptionConfigured() pour que la plateforme puisse alerter en son absence', async () => {
    const db = await getDb();
    const admin = await db.getRepository('PlatformAdmin').save({
      email: `platform-admin-${randomBytes(6).toString('hex')}@example.com`,
      passwordHash: await hashPassword('test-password-123'),
      nom: 'Test Platform Admin',
      active: true,
    });
    const { token } = await createPlatformSession(admin.id);

    try {
      const response = await GET(new NextRequest('http://localhost/api/plateforme/me', {
        headers: { cookie: `${PLATFORM_SESSION_COOKIE_NAME}=${token}` },
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      // L'endpoint reflète l'état réel de isEncryptionConfigured() : c'est le point de
      // consultation exploité par l'interface plateforme pour afficher son bandeau d'alerte.
      expect(body.encryptionConfigured).toBe(isEncryptionConfigured());
      expect(typeof body.nodeEnv).toBe('string');
    } finally {
      await db.getRepository('PlatformSession').delete({ id: token });
      await db.getRepository('PlatformAdmin').delete({ id: admin.id });
    }
  });
});
