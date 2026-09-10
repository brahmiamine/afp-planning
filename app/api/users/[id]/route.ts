import type { EntityManager } from 'typeorm';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { normalizeAccessRole, normalizePlanningFunctions } from '@/lib/auth/roles';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { hasFuturePlanningAssignments } from '@/lib/planning/person-link';
import { findUserReferences } from '@/lib/planning/user-references';
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

function getRepo(db: Awaited<ReturnType<typeof getDb>>) {
  return db.getRepository<UserEntity>('User');
}

/**
 * Verrou pessimiste sur tous les administrateurs actifs du club (issue #273) : deux
 * démotions/désactivations/suppressions concurrentes visant chacune « le dernier
 * administrateur » se sérialisent ici — la seconde ne relit le compte qu'une fois la
 * première validée, et voit alors le compte réellement à jour.
 */
async function countActiveAdminsLocked(manager: EntityManager, clubId: string): Promise<number> {
  const admins = await manager
    .getRepository<UserEntity>('User')
    .createQueryBuilder('user')
    .setLock('pessimistic_write')
    .where('user.clubId = :clubId AND user.active = :active AND user.accessRole = :role', {
      clubId,
      active: true,
      role: 'admin',
    })
    .getMany();
  return admins.length;
}

type PutOutcome =
  | { kind: 'not-found' }
  | { kind: 'last-admin' }
  | { kind: 'ok'; userId: number; revokeSessions: boolean; notifyDeactivatedWithAssignments: boolean };

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

    const body = await request.json();
    const { nom, active, telephone, password } = body;
    if (typeof password === 'string' && password.length > 0 && password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
    }

    const db = await getDb();
    const outcome: PutOutcome = await db.transaction(async (manager) => {
      const userRepo = manager.getRepository<UserEntity>('User');
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id AND user.clubId = :clubId', { id, clubId: auth.user.clubId })
        .getOne();
      if (!user) return { kind: 'not-found' };

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
        const activeAdmins = await countActiveAdminsLocked(manager, auth.user.clubId);
        if (activeAdmins <= 1) return { kind: 'last-admin' };
      }

      if (typeof nom === 'string' && nom.trim() !== '') user.nom = nom.trim();
      user.accessRole = nextAccessRole;
      user.planningFunctions = nextFunctions;
      user.active = nextActive;
      if (typeof telephone === 'string') user.telephone = telephone.trim() || null;
      if (typeof password === 'string' && password.length > 0) {
        user.passwordHash = await hashPassword(password);
      }
      await userRepo.save(user);

      return {
        kind: 'ok',
        userId: user.id,
        revokeSessions: !user.active || (typeof password === 'string' && password.length > 0),
        notifyDeactivatedWithAssignments: wasActive && !user.active,
      };
    });

    if (outcome.kind === 'not-found') {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }
    if (outcome.kind === 'last-admin') {
      return NextResponse.json(
        { error: 'Impossible de désactiver ou rétrograder le dernier administrateur' },
        { status: 400 },
      );
    }

    if (outcome.revokeSessions) {
      await revokeAllSessionsForUser(outcome.userId);
    }

    // Issue #206 : désactiver un dirigeant qui a des affectations à venir mérite une
    // alerte administrateur explicite, plutôt que de découvrir le trou de couverture
    // seulement au moment de publier.
    if (outcome.notifyDeactivatedWithAssignments) {
      const { timeZone } = await readAppSettings(db, auth.user.clubId);
      if (await hasFuturePlanningAssignments(db, outcome.userId, timeZone)) {
        const user = await getRepo(db).findOneBy({ id: outcome.userId });
        await notifyAdmins(db, {
          type: 'user-deactivated-with-assignments',
          title: 'Dirigeant désactivé avec affectations à venir',
          message: `${user?.nom ?? 'Ce dirigeant'} a été désactivé alors qu'il reste affecté à au moins un événement futur.`,
        });
      }
    }

    const users = await getRepo(db).find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error updating user in DB:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

type DeleteOutcome =
  | { kind: 'not-found' }
  | { kind: 'last-admin' }
  | { kind: 'referenced'; reasons: string[] }
  | { kind: 'deleted'; userId: number };

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
    const outcome: DeleteOutcome = await db.transaction(async (manager) => {
      const userRepo = manager.getRepository<UserEntity>('User');
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id AND user.clubId = :clubId', { id, clubId: auth.user.clubId })
        .getOne();
      if (!user) return { kind: 'not-found' };

      if (user.accessRole === 'admin') {
        const activeAdmins = await countActiveAdminsLocked(manager, auth.user.clubId);
        if (activeAdmins <= 1) return { kind: 'last-admin' };
      }

      // Préférer la désactivation à la suppression physique pour tout compte référencé
      // par des données métier existantes (issue #273) : une suppression laisserait des
      // références orphelines dans les brouillons, le planning publié, l'historique, un
      // autre enregistrement de planning ou une conversation de chat.
      const references = await findUserReferences(manager, auth.user.clubId, user.id);
      if (references.referenced) return { kind: 'referenced', reasons: references.reasons };

      // RGPD / droit à l'effacement (issue #259) : le nom d'expéditeur est dénormalisé en
      // clair sur chat_messages pour l'affichage — anonymisé avant la suppression du compte
      // pour ne pas laisser son identité attribuée à d'anciens messages. Dans la même
      // transaction que la suppression : l'un ne peut pas réussir sans l'autre.
      await anonymizeMessagesForDeletedUser(manager, user.id);
      await userRepo.remove(user);

      return { kind: 'deleted', userId: user.id };
    });

    if (outcome.kind === 'not-found') {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }
    if (outcome.kind === 'last-admin') {
      return NextResponse.json({ error: 'Impossible de supprimer le dernier administrateur' }, { status: 400 });
    }
    if (outcome.kind === 'referenced') {
      return NextResponse.json(
        {
          // `details` : convention partagée par les routes qui renvoient une liste
          // structurée en plus du message générique (voir ApiRequestError.details).
          error: 'Ce compte est référencé par des données existantes et ne peut pas être supprimé définitivement : désactivez-le à la place.',
          details: outcome.reasons,
        },
        { status: 409 },
      );
    }

    await revokeAllSessionsForUser(outcome.userId);

    const users = await getRepo(db).find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error deleting user in DB:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
