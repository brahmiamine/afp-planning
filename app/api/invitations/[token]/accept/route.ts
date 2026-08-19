import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { InvitationEntity, UserEntity } from '@/lib/db/schemas';
import { hashPassword } from '@/lib/auth/password';
import { isUserRole } from '@/lib/auth/roles';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

// POST: public — accepts an invitation link and creates the corresponding user account
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
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 },
      );
    }
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }

    const db = await getDb();
    const invitationRepo = db.getRepository<InvitationEntity>('Invitation');
    const userRepo = db.getRepository<UserEntity>('User');

    const invitation = await invitationRepo.findOneBy({ id: token });
    if (!invitation) {
      return NextResponse.json({ error: 'Lien d\'invitation introuvable' }, { status: 404 });
    }
    if (invitation.usedAt) {
      return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 409 });
    }
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Ce lien a expiré' }, { status: 410 });
    }
    if (!isUserRole(invitation.role)) {
      return NextResponse.json({ error: 'Rôle d\'invitation invalide' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (invitation.email && invitation.email !== normalizedEmail) {
      return NextResponse.json(
        { error: 'Cette invitation est réservée à une autre adresse email' },
        { status: 400 },
      );
    }

    const existingUser = await userRepo.findOneBy({ email: normalizedEmail });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Un utilisateur avec cet email existe déjà' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepo.save({
      email: normalizedEmail,
      passwordHash,
      nom: nom.trim(),
      role: invitation.role,
      active: true,
      personNom: invitation.personNom,
      icalToken: randomBytes(24).toString('hex'),
    });

    invitation.usedAt = new Date();
    invitation.usedByUserId = user.id;
    await invitationRepo.save(invitation);

    const { token: sessionToken, expiresAt } = await createSession(user.id, {
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
