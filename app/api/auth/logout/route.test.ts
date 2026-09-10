import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { POST } from './route';
import { GET as getMe } from '@/app/api/auth/me/route';

const dbAvailable = await isDbAvailable();

function logoutRequest(token?: string) {
  return new NextRequest('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : undefined,
  });
}

function meRequest(token: string) {
  return new NextRequest('http://localhost/api/auth/me', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe.skipIf(!dbAvailable)('POST /api/auth/logout (issue #286)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('revokes the session and clears the cookie', async () => {
    const account = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    cleanups.push(account.cleanup);

    expect(await getSessionUser(account.token)).not.toBeNull();

    const response = await POST(logoutRequest(account.token));
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeFalsy();

    expect(await getSessionUser(account.token)).toBeNull();
    const me = await getMe(meRequest(account.token));
    expect(me.status).toBe(401);
  });

  it('succeeds without a session cookie', async () => {
    const response = await POST(logoutRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });
});
