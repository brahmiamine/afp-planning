import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Code d'authentification statique (à changer en production)
const AUTH_CODE = process.env.AUTH_CODE || 'afp2026';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || code !== AUTH_CODE) {
      return NextResponse.json(
        { error: 'Code incorrect' },
        { status: 401 }
      );
    }

    // Créer une session avec expiration de 3 heures
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 3);

    const cookieStore = await cookies();
    cookieStore.set('auth_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Une erreur est survenue' },
      { status: 500 }
    );
  }
}
