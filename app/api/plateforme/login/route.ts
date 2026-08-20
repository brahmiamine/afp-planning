import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PlatformAdminEntity } from '@/lib/db/schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createPlatformSession, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/auth/platform-session';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<PlatformAdminEntity>('PlatformAdmin');
    const admin = await repo.findOneBy({ email: email.trim().toLowerCase() });

    if (!admin || !admin.active) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, admin.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const { token, expiresAt } = await createPlatformSession(admin.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(PLATFORM_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Error during platform login:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
