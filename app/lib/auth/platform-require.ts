import { NextRequest, NextResponse } from 'next/server';
import {
  getPlatformSessionAdmin,
  PLATFORM_SESSION_COOKIE_NAME,
  type PlatformAdminSessionUser,
} from './platform-session';

export type RequirePlatformResult = { admin: PlatformAdminSessionUser } | { error: NextResponse };

export async function requirePlatformAuth(request: NextRequest): Promise<RequirePlatformResult> {
  const token = request.cookies.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  const admin = await getPlatformSessionAdmin(token);

  if (!admin) {
    return {
      error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }),
    };
  }

  return { admin };
}
