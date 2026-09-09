import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, SessionUser, SESSION_COOKIE_NAME } from './session';
import { ClubAccessRole } from './roles';
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

/** Contrôle le rôle d'accès au club ; une fonction opérationnelle n'ouvre jamais ces routes. */
export async function requireRole(request: NextRequest, roles: ClubAccessRole[]): Promise<RequireResult> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return authResult;
  }

  if (!roles.includes(authResult.user.accessRole)) {
    return {
      error: NextResponse.json(
        { error: 'Action non autorisée pour votre rôle' },
        { status: 403 },
      ),
    };
  }

  return authResult;
}
