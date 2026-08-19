import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) {
    return auth.error;
  }

  return NextResponse.json(auth.user);
}
