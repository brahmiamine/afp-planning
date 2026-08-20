import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SessionUser } from './session';

const getSessionUserMock = vi.fn<(token: string | undefined | null) => Promise<SessionUser | null>>();

vi.mock('./session', () => ({
  getSessionUser: (...args: [string | undefined | null]) => getSessionUserMock(...args),
  SESSION_COOKIE_NAME: 'session_token',
}));

const { requireAuth, requireRole } = await import('./require');

function makeRequest(token?: string) {
  return new NextRequest('http://localhost/api/test', {
    headers: token ? { cookie: `session_token=${token}` } : {},
  });
}

const adminUser: SessionUser = {
  id: 1,
  email: 'admin@example.com',
  nom: 'Admin',
  roles: ['admin'],
  personLinks: [],
  active: true,
  icalToken: 'abc',
};

describe('requireAuth', () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
  });

  it('returns 401 when there is no session cookie', async () => {
    getSessionUserMock.mockResolvedValue(null);
    const result = await requireAuth(makeRequest());
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
    }
  });

  it('returns the user when the session is valid', async () => {
    getSessionUserMock.mockResolvedValue(adminUser);
    const result = await requireAuth(makeRequest('valid-token'));
    expect('user' in result).toBe(true);
    if ('user' in result) {
      expect(result.user.email).toBe('admin@example.com');
    }
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
  });

  it('returns 403 when the role does not match', async () => {
    getSessionUserMock.mockResolvedValue({ ...adminUser, roles: ['arbitre'] });
    const result = await requireRole(makeRequest('token'), ['superadmin', 'admin']);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
    }
  });

  it('returns the user when the role matches', async () => {
    getSessionUserMock.mockResolvedValue(adminUser);
    const result = await requireRole(makeRequest('token'), ['superadmin', 'admin']);
    expect('user' in result).toBe(true);
  });
});
