import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/server';

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    redirectTo: session.role === 'SUPER_ADMIN' ? '/' : '/me',
    user: {
      id: session.sub,
      email: session.email,
      role: session.role,
      personId: session.personId ?? null,
      personName: session.personName ?? null,
    },
  });
}
