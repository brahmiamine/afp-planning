import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { InvitationEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { INVITABLE_ROLES, isReadOnlyRole, isUserRole } from '@/lib/auth/roles';
import { resolvePersonLinkForRole } from '@/lib/planning/person-link';
import type { PersonType } from '@/types/match';

function isPersonType(value: unknown): value is PersonType {
  return value === 'officiel' || value === 'encadrant' || value === 'accompagnateur';
}

function serializeInvitation(invitation: InvitationEntity) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    personNom: invitation.personNom,
    personType: invitation.personType,
    personId: invitation.personId,
    expiresAt: invitation.expiresAt,
    usedAt: invitation.usedAt,
    createdAt: invitation.createdAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const repo = db.getRepository<InvitationEntity>('Invitation');
    const invitations = await repo.find({ order: { createdAt: 'DESC' } });
    return NextResponse.json({ invitations: invitations.map(serializeInvitation) });
  } catch (error) {
    console.error('Error reading invitations from DB:', error);
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { email, role, personNom, personId, personType, expiresInDays } = body;

    if (!isUserRole(role) || !INVITABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'La création d\'un superadministrateur doit passer par la gestion des utilisateurs' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const link = await resolvePersonLinkForRole(db, role, {
      personNom: typeof personNom === 'string' ? personNom : null,
      personId: typeof personId === 'number' ? personId : null,
      personType: isPersonType(personType) ? personType : null,
    });

    if (isReadOnlyRole([role]) && !link) {
      return NextResponse.json(
        { error: 'Ce rôle doit être lié à une personne existante du planning' },
        { status: 400 },
      );
    }

    const days = Number.isFinite(expiresInDays) && expiresInDays > 0 ? expiresInDays : 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const repo = db.getRepository<InvitationEntity>('Invitation');

    const invitation: InvitationEntity = {
      id: randomBytes(24).toString('hex'),
      email: typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null,
      role,
      personNom: link?.personNom ?? null,
      personType: link?.personType ?? null,
      personId: link?.personId ?? null,
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
