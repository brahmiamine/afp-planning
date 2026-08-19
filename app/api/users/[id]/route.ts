import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { isUserRole } from '@/lib/auth/roles';
import { revokeAllSessionsForUser } from '@/lib/auth/session';

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    role: user.role,
    active: user.active,
    personNom: user.personNom,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const user = await repo.findOneBy({ id });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    const body = await request.json();
    const { nom, role, active, personNom, password } = body;

    const wouldLeaveNoSuperadmin = async () => {
      if (user.role !== 'superadmin') {
        return false;
      }
      const nextRole = isUserRole(role) ? role : user.role;
      const nextActive = typeof active === 'boolean' ? active : user.active;
      if (nextRole === 'superadmin' && nextActive) {
        return false;
      }
      const activeSuperadmins = await repo.count({ where: { role: 'superadmin', active: true } });
      return activeSuperadmins <= 1;
    };

    if (await wouldLeaveNoSuperadmin()) {
      return NextResponse.json(
        { error: 'Impossible de désactiver ou rétrograder le dernier superadministrateur' },
        { status: 400 },
      );
    }

    if (typeof nom === 'string' && nom.trim() !== '') {
      user.nom = nom.trim();
    }
    if (isUserRole(role)) {
      user.role = role;
    }
    if (typeof active === 'boolean') {
      user.active = active;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'personNom')) {
      user.personNom = typeof personNom === 'string' && personNom.trim() !== '' ? personNom.trim() : null;
    }
    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Le mot de passe doit contenir au moins 8 caractères' },
          { status: 400 },
        );
      }
      user.passwordHash = await hashPassword(password);
    }

    await repo.save(user);

    if (user.active === false) {
      await revokeAllSessionsForUser(user.id);
    }

    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error updating user in DB:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const user = await repo.findOneBy({ id });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    if (user.role === 'superadmin') {
      const activeSuperadmins = await repo.count({ where: { role: 'superadmin', active: true } });
      if (activeSuperadmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de supprimer le dernier superadministrateur' },
          { status: 400 },
        );
      }
    }

    await repo.remove(user);
    await revokeAllSessionsForUser(id);

    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error deleting user in DB:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
