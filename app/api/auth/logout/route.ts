import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AFP_SESSION_COOKIE } from '@/lib/auth/session';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(AFP_SESSION_COOKIE);
  cookieStore.delete('auth_session');

  return NextResponse.json({ success: true });
}
