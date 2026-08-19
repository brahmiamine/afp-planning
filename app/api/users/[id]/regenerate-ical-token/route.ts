import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireAuth } from '@/lib/auth/require';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth(request);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    if (auth.user.role !== 'superadmin' && auth.user.id !== id) {
      return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const user = await repo.findOneBy({ id });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    user.icalToken = randomBytes(24).toString('hex');
    await repo.save(user);

    return NextResponse.json({ success: true, icalToken: user.icalToken });
  } catch (error) {
    console.error('Error regenerating ical token:', error);
    return NextResponse.json({ error: 'Failed to regenerate token' }, { status: 500 });
  }
}
