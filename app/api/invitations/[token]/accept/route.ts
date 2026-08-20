import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { InvitationEntity, UserEntity } from '@/lib/db/schemas';
import { hashPassword } from '@/lib/auth/password';
import { isReadOnlyRole, isUserRole } from '@/lib/auth/roles';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

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
    if (!isUserRole(invitation.role)) {
      return NextResponse.json({ error: 'Rôle d\'invitation invalide' }, { status: 400 });
    }
    if (isReadOnlyRole([invitation.role]) && (!invitation.personType || invitation.personId === null)) {
      return NextResponse.json({ error: 'Cette invitation n\'est plus liée à une personne valide' }, { status: 409 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (invitation.email && invitation.email !== normalizedEmail) {
      return NextResponse.json({ error: 'Cette invitation est réservée à une autre adresse email' }, { status: 400 });
    }
    if (await userRepo.findOneBy({ email: normalizedEmail })) {
      return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const personLinks = invitation.personType && invitation.personId !== null && invitation.personNom
      ? [{ personType: invitation.personType, personId: invitation.personId, personNom: invitation.personNom }]
      : [];
    const user = await userRepo.save({
      clubId: invitation.clubId,
      email: normalizedEmail,
      passwordHash,
      nom: nom.trim(),
      roles: [invitation.role],
      active: true,
      personLinks,
      icalToken: randomBytes(24).toString('hex'),
    });

    invitation.usedAt = new Date();
    invitation.usedByUserId = user.id;
    await invitationRepo.save(invitation);

    const { token: sessionToken, expiresAt } = await createSession(user.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: isReadOnlyRole([invitation.role]) ? '/mon-planning' : '/',
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
