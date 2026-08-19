import { cookies } from 'next/headers';
import type { AuthSession } from '@/types/auth';
import { AFP_SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { getAuthUserById } from '@/lib/auth/users';

export async function getCurrentSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AFP_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return null;
  }

  const user = await getAuthUserById(session.sub);
  if (!user || !user.active || user.email !== session.email || user.role !== session.role) {
    return null;
  }

  return {
    ...session,
    ...(typeof user.personId === 'number' ? { personId: user.personId } : {}),
    ...(user.personName ? { personName: user.personName } : {}),
  };
}

export async function getSuperAdminSession(): Promise<AuthSession | null> {
  const session = await getCurrentSession();
  return session?.role === 'SUPER_ADMIN' ? session : null;
}
