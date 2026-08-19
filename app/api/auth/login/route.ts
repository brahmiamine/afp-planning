import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isReadOnlyRole, isUserRole } from '@/lib/auth/roles';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const user = await repo.findOneBy({ email: email.trim().toLowerCase() });

    if (!user || !user.active || !isUserRole(user.role)) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const { token, expiresAt } = await createSession(user.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      redirectTo: isReadOnlyRole(user.role) ? '/mon-planning' : '/',
    });
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
