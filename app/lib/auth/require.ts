import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, SessionUser, SESSION_COOKIE_NAME } from './session';
import { UserRole } from './roles';
import { setCurrentClubId } from './club-context';

export type RequireResult = { user: SessionUser } | { error: NextResponse };

export async function requireAuth(request: NextRequest): Promise<RequireResult> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await getSessionUser(token);

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }),
    };
  }

  setCurrentClubId(user.clubId);
  return { user };
}

export async function requireRole(request: NextRequest, roles: UserRole[]): Promise<RequireResult> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return authResult;
  }

  if (!authResult.user.roles.some((role) => roles.includes(role))) {
    return {
      error: NextResponse.json(
        { error: 'Action non autorisée pour votre rôle' },
        { status: 403 },
      ),
    };
  }

  return authResult;
}
