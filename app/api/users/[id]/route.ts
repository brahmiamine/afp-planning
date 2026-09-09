import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { normalizeAccessRole, normalizePlanningFunctions } from '@/lib/auth/roles';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { hasFuturePlanningAssignments } from '@/lib/planning/person-link';
import { notifyAdmins } from '@/lib/notifications/service';
import { readAppSettings } from '@/lib/settings-store';
import { anonymizeMessagesForDeletedUser } from '@/lib/chat/service';

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    accessRole: user.accessRole,
    planningFunctions: user.planningFunctions,
    active: user.active,
    telephone: user.telephone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function countActiveAdmins(repo: ReturnType<typeof getRepo>, clubId: string): Promise<number> {
  const users = await repo.find({ where: { active: true, clubId } });
  return users.filter((user) => user.accessRole === 'admin').length;
}

function getRepo(db: Awaited<ReturnType<typeof getDb>>) {
  return db.getRepository<UserEntity>('User');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, ['admin']);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = getRepo(db);
    const user = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    const body = await request.json();
    const { nom, active, telephone, password } = body;
    const nextAccessRole = body.accessRole !== undefined
      ? normalizeAccessRole(body.accessRole)
      : normalizeAccessRole(user.accessRole);
    const nextFunctions = body.planningFunctions !== undefined
      ? normalizePlanningFunctions(body.planningFunctions)
      : normalizePlanningFunctions(user.planningFunctions);
    const nextActive = typeof active === 'boolean' ? active : user.active;

    const wasActive = user.active;
    const wasAdmin = user.accessRole === 'admin';
    const staysAdmin = nextAccessRole === 'admin';
    if (wasAdmin && (!staysAdmin || !nextActive)) {
      const activeAdmins = await countActiveAdmins(repo, auth.user.clubId);
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de désactiver ou rétrograder le dernier administrateur' },
          { status: 400 },
        );
      }
    }

    if (typeof nom === 'string' && nom.trim() !== '') user.nom = nom.trim();
    user.accessRole = nextAccessRole;
    user.planningFunctions = nextFunctions;
    user.active = nextActive;
    if (typeof telephone === 'string') user.telephone = telephone.trim() || null;

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
      }
      user.passwordHash = await hashPassword(password);
    }

    await repo.save(user);

    if (!user.active || (typeof password === 'string' && password.length > 0)) {
      await revokeAllSessionsForUser(user.id);
    }

    // Issue #206 : désactiver un dirigeant qui a des affectations à venir mérite une
    // alerte administrateur explicite, plutôt que de découvrir le trou de couverture
    // seulement au moment de publier.
    if (wasActive && !user.active) {
      const { timeZone } = await readAppSettings(db, auth.user.clubId);
      if (await hasFuturePlanningAssignments(db, user.id, timeZone)) {
        await notifyAdmins(db, {
          type: 'user-deactivated-with-assignments',
          title: 'Dirigeant désactivé avec affectations à venir',
          message: `${user.nom} a été désactivé alors qu'il reste affecté à au moins un événement futur.`,
        });
      }
    }

    const users = await repo.find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
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
  const auth = await requireRole(request, ['admin']);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = getRepo(db);
    const user = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    if (user.accessRole === 'admin') {
      const activeAdmins = await countActiveAdmins(repo, auth.user.clubId);
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de supprimer le dernier administrateur' },
          { status: 400 },
        );
      }
    }

    await revokeAllSessionsForUser(id);
    // RGPD / droit à l'effacement (issue #259) : le nom d'expéditeur est dénormalisé en
    // clair sur chat_messages pour l'affichage — anonymisé avant la suppression du compte
    // pour ne pas laisser son identité attribuée à d'anciens messages.
    await anonymizeMessagesForDeletedUser(db, id);
    await repo.remove(user);

    const users = await repo.find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error deleting user in DB:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
