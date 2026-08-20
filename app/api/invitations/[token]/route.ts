import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { InvitationEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';

// GET: public — used by the /inscription/[token] page to validate a link before signup
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const token = resolvedParams.token;

    const db = await getDb();
    const repo = db.getRepository<InvitationEntity>('Invitation');
    const invitation = await repo.findOneBy({ id: token });

    if (!invitation) {
      return NextResponse.json({ valid: false, error: 'Lien d\'invitation introuvable' }, { status: 404 });
    }
    if (invitation.usedAt) {
      return NextResponse.json({ valid: false, error: 'Ce lien a déjà été utilisé' }, { status: 410 });
    }
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ valid: false, error: 'Ce lien a expiré' }, { status: 410 });
    }

    return NextResponse.json({
      valid: true,
      email: invitation.email,
      role: invitation.role,
      personNom: invitation.personNom,
    });
  } catch (error) {
    console.error('Error validating invitation:', error);
    return NextResponse.json({ valid: false, error: 'Une erreur est survenue' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const token = resolvedParams.token;

    const db = await getDb();
    const repo = db.getRepository<InvitationEntity>('Invitation');
    const invitation = await repo.findOneBy({ id: token, clubId: auth.user.clubId });
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation non trouvée' }, { status: 404 });
    }

    await repo.remove(invitation);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking invitation:', error);
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 });
  }
}
