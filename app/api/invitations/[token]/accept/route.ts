import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { InvitationEntity, UserEntity } from '@/lib/db/schemas';
import { hashPassword } from '@/lib/auth/password';
import {
  ALL_PLANNING_FUNCTIONS,
  canEdit,
  isClubAccessRole,
  normalizePlanningFunctions,
} from '@/lib/auth/roles';
import { hasAccountAccess } from '@/lib/auth/placeholder-account';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isClubTenantActive } from '@/lib/db/club-tenants';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const token = resolvedParams.token;
    const body = await request.json();
    const { email, password, nom } = body;

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return NextResponse.json({ error: 'L\'email est requis' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
    }
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }

    const db = await getDb();
    const invitationRepo = db.getRepository<InvitationEntity>('Invitation');
    const userRepo = db.getRepository<UserEntity>('User');
    const invitation = await invitationRepo.findOneBy({ id: token });

    if (!invitation) return NextResponse.json({ error: 'Lien d\'invitation introuvable' }, { status: 404 });
    if (invitation.usedAt) return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 409 });
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Ce lien a expiré' }, { status: 410 });
    }
    if (!isClubAccessRole(invitation.accessRole)) {
      return NextResponse.json({ error: 'Rôle d\'invitation invalide' }, { status: 400 });
    }
    // Un club désactivé après l'envoi de l'invitation ne doit plus permettre la création
    // du compte (issue #213). Même message que le lien introuvable : ne pas révéler
    // l'existence ni l'état du club côté client.
    if (!(await isClubTenantActive(db, invitation.clubId))) {
      return NextResponse.json({ error: 'Lien d\'invitation introuvable' }, { status: 404 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (invitation.email && invitation.email !== normalizedEmail) {
      return NextResponse.json({ error: 'Cette invitation est réservée à une autre adresse email' }, { status: 400 });
    }

    // Invitation ciblant un profil de dirigeant sans accès (issue #204) : on attache
    // les identifiants au profil existant — jamais de second utilisateur, afin de
    // conserver fonctions, affectations et historique rattachés à `users.id`.
    let existingProfile: UserEntity | null = null;
    if (invitation.personId != null) {
      existingProfile = await userRepo.findOneBy({ id: invitation.personId, clubId: invitation.clubId });
      if (!existingProfile) {
        return NextResponse.json({ error: 'Le profil visé par cette invitation n\'existe plus' }, { status: 404 });
      }
      if (hasAccountAccess(existingProfile)) {
        return NextResponse.json({ error: 'Ce profil a déjà été activé' }, { status: 409 });
      }
      if (!existingProfile.active) {
        return NextResponse.json({ error: 'Ce profil a été désactivé : contactez un administrateur' }, { status: 403 });
      }
    }

    const emailOwner = await userRepo.findOneBy({ email: normalizedEmail });
    if (emailOwner && emailOwner.id !== existingProfile?.id) {
      return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const claimedAt = new Date();
    let user: UserEntity;
    if (existingProfile) {
      existingProfile.email = normalizedEmail;
      existingProfile.passwordHash = passwordHash;
      existingProfile.nom = nom.trim();
      existingProfile.accessRole = invitation.accessRole;
      // Les fonctions de l'invitation complètent celles du profil, sans jamais en
      // retirer : l'activation ne doit pas amputer le référentiel existant.
      const functions = new Set([
        ...normalizePlanningFunctions(existingProfile.planningFunctions),
        ...normalizePlanningFunctions(invitation.planningFunctions),
      ]);
      existingProfile.planningFunctions = ALL_PLANNING_FUNCTIONS.filter((fn) => functions.has(fn));
      existingProfile.claimedAt = claimedAt;
      user = await userRepo.save(existingProfile);
    } else {
      user = await userRepo.save({
        clubId: invitation.clubId,
        email: normalizedEmail,
        passwordHash,
        nom: nom.trim(),
        accessRole: invitation.accessRole,
        planningFunctions: normalizePlanningFunctions(invitation.planningFunctions),
        active: true,
        claimedAt,
        icalToken: randomBytes(24).toString('hex'),
      });
    }

    invitation.usedAt = claimedAt;
    invitation.usedByUserId = user.id;
    await invitationRepo.save(invitation);

    const { token: sessionToken, expiresAt } = await createSession(user.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: canEdit(invitation.accessRole) ? '/club' : '/mon-planning',
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
