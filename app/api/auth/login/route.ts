import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { canEdit, normalizeAccessRole } from '@/lib/auth/roles';
import { isClubTenantActive } from '@/lib/db/club-tenants';
import { hasAccountAccess } from '@/lib/auth/placeholder-account';
import { getClientIp } from '@/lib/auth/client-ip';
import {
  checkLoginRateLimit,
  hashBucketComponent,
  recordFailedLoginAttempt,
  resetLoginRateLimit,
} from '@/lib/auth/login-rate-limit';

const GENERIC_ERROR = { error: 'Email ou mot de passe incorrect' };

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Trop de tentatives. Réessayez plus tard.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const db = await getDb();
    // Issue #274 : la limite par IP est vérifiée AVANT même de lire le corps de la
    // requête, pour qu'une IP bloquée ne puisse pas consommer de travail supplémentaire
    // (validation, requête base) en variant le contenu envoyé.
    const ip = getClientIp(request);
    const ipBucket = `login:ip:${hashBucketComponent(ip)}`;
    const ipLimit = await checkLoginRateLimit(db, ipBucket);
    if (ipLimit.limited) return tooManyRequests(ipLimit.retryAfterSeconds!);

    const { email, password } = await request.json();
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const identityBucket = `login:identity:${hashBucketComponent(normalizedEmail)}`;
    const identityLimit = await checkLoginRateLimit(db, identityBucket);
    if (identityLimit.limited) return tooManyRequests(identityLimit.retryAfterSeconds!);

    const repo = db.getRepository<UserEntity>('User');
    const user = await repo.findOneBy({ email: normalizedEmail });

    const fail = async () => {
      const [ipResult] = await Promise.all([
        recordFailedLoginAttempt(db, ipBucket),
        recordFailedLoginAttempt(db, identityBucket),
      ]);
      if (ipResult.limited) {
        console.warn(`[auth] Connexion : verrouillage par IP déclenché (${ip}, ${ipResult.retryAfterSeconds}s)`);
      }
      return NextResponse.json(GENERIC_ERROR, { status: 401 });
    };

    // Un profil sans accès (issue #204) n'a pas d'identifiants connus : même si le
    // hash technique venait à être deviné, il ne doit jamais ouvrir de session.
    if (!user || !user.active || !hasAccountAccess(user)) {
      return await fail();
    }

    const clubId = user.clubId || process.env.APP_CLUB_ID || 'afp';
    if (!(await isClubTenantActive(db, clubId))) {
      return await fail();
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return await fail();
    }

    await Promise.all([
      resetLoginRateLimit(db, ipBucket),
      resetLoginRateLimit(db, identityBucket),
    ]);

    const { token, expiresAt } = await createSession(user.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const redirectTo = canEdit(normalizeAccessRole(user.accessRole))
      ? '/club'
      : '/mon-planning';

    const response = NextResponse.json({ success: true, redirectTo });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
