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
    // L'email n'est plus unique que par club (issue #266) : plusieurs comptes,
    // chacun avec son propre mot de passe, peuvent partager la même adresse dans
    // des clubs différents. Il n'existe ni sélecteur de club ni sous-domaine par
    // club à la connexion — le mot de passe fourni sert donc à désambiguïser :
    // chaque compte candidat éligible est essayé jusqu'à trouver celui dont le
    // mot de passe correspond. Dans le cas résiduel, extrêmement improbable, où
    // le même mot de passe serait valide pour deux comptes de clubs différents,
    // le premier trouvé l'emporte ; lever cette ambiguïté proprement nécessiterait
    // un sélecteur de club explicite, hors périmètre de ce correctif.
    const candidates = await repo.find({ where: { email: normalizedEmail } });

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

    let matchedUser: UserEntity | null = null;
    for (const candidate of candidates) {
      // Un profil sans accès (issue #204) n'a pas d'identifiants connus : même si
      // le hash technique venait à être deviné, il ne doit jamais ouvrir de session.
      if (!candidate.active || !hasAccountAccess(candidate)) continue;

      const candidateClubId = candidate.clubId || process.env.APP_CLUB_ID || 'afp';
      if (!(await isClubTenantActive(db, candidateClubId))) continue;

      if (await verifyPassword(password, candidate.passwordHash)) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      return await fail();
    }

    await Promise.all([
      resetLoginRateLimit(db, ipBucket),
      resetLoginRateLimit(db, identityBucket),
    ]);

    const { token, expiresAt } = await createSession(matchedUser.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const redirectTo = canEdit(normalizeAccessRole(matchedUser.accessRole))
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
