import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSessionToken, AFP_SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth/session';
import { ensureBootstrapSuperAdmin, getAuthUserByEmail } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { isUserRole } from '@/types/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 },
      );
    }

    await ensureBootstrapSuperAdmin();

    const user = await getAuthUserByEmail(email);
    const passwordValid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !user.active || !passwordValid || !isUserRole(user.role)) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect' },
        { status: 401 },
      );
    }

    if (user.role !== 'SUPER_ADMIN' && typeof user.personId !== 'number') {
      return NextResponse.json(
        { error: 'Ce compte n’est pas lié à une personne du planning' },
        { status: 403 },
      );
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(typeof user.personId === 'number' ? { personId: user.personId } : {}),
      ...(user.personName ? { personName: user.personName } : {}),
    });

    const cookieStore = await cookies();
    cookieStore.set(AFP_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
    });
    cookieStore.delete('auth_session');

    const redirectTo = user.role === 'SUPER_ADMIN' ? '/' : '/me';

    return NextResponse.json({
      success: true,
      redirectTo,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    const rawMessage = error instanceof Error ? error.message : '';
    const configurationError =
      rawMessage.startsWith('SUPERADMIN_') || rawMessage.startsWith('AUTH_SECRET');

    return NextResponse.json(
      { error: configurationError ? rawMessage : 'Service d’authentification indisponible' },
      { status: 503 },
    );
  }
}
