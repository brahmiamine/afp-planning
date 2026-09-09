import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { InvitationEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { isClubAccessRole, normalizePlanningFunctions } from '@/lib/auth/roles';
import { setCurrentClubId } from '@/lib/auth/club-context';

function serializeInvitation(invitation: InvitationEntity) {
  return {
    id: invitation.id,
    email: invitation.email,
    accessRole: invitation.accessRole,
    planningFunctions: invitation.planningFunctions,
    personNom: invitation.personNom,
    personType: invitation.personType,
    personId: invitation.personId,
    expiresAt: invitation.expiresAt,
    usedAt: invitation.usedAt,
    createdAt: invitation.createdAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const repo = db.getRepository<InvitationEntity>('Invitation');
    const invitations = await repo.find({
      where: { clubId: auth.user.clubId },
      order: { createdAt: 'DESC' },
    });
    return NextResponse.json({ invitations: invitations.map(serializeInvitation) });
  } catch (error) {
    console.error('Error reading invitations from DB:', error);
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const { email, accessRole, personNom, expiresInDays } = body;

    if (!isClubAccessRole(accessRole)) {
      return NextResponse.json(
        { error: 'Rôle d\'accès invalide' },
        { status: 400 },
      );
    }
    // Un administrateur ne se voit pas imposer de fonction terrain par l'invitation :
    // seules les fonctions d'un dirigeant sont proposées à l'inscription.
    const planningFunctions = normalizePlanningFunctions(body.planningFunctions);

    const db = await getDb();
    const days = Number.isFinite(expiresInDays) && expiresInDays > 0 ? expiresInDays : 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const repo = db.getRepository<InvitationEntity>('Invitation');

    const invitation: InvitationEntity = {
      id: randomBytes(24).toString('hex'),
      clubId: auth.user.clubId,
      email: typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null,
      accessRole,
      planningFunctions,
      personNom: typeof personNom === 'string' && personNom.trim() !== '' ? personNom.trim() : null,
      personType: null,
      personId: null,
      createdByUserId: auth.user.id,
      expiresAt,
      usedAt: null,
      usedByUserId: null,
      createdAt: new Date(),
    };

    await repo.save(invitation);

    return NextResponse.json({
      success: true,
      invitation: serializeInvitation(invitation),
      url: `/inscription/${invitation.id}`,
    });
  } catch (error) {
    console.error('Error creating invitation in DB:', error);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }
}
