import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/auth/platform-require';

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  return NextResponse.json({
    admin: {
      id: auth.admin.id,
      email: auth.admin.email,
      nom: auth.admin.nom,
    },
  });
}
