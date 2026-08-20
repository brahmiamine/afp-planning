import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { isReadOnlyRole } from '@/lib/auth/roles';
import { findLinkedPerson } from '@/lib/planning/person-link';
import { normalizeIndisponibilites } from '@/lib/utils/officiel-availability';
import { notifyAdmins } from '@/lib/notifications/service';
import type { PersonType } from '@/types/match';
import type { SessionUser } from '@/lib/auth/session';

function repositoryName(personType: PersonType) {
  if (personType === 'officiel') return 'Officiel';
  if (personType === 'encadrant') return 'Encadrant';
  return 'Accompagnateur';
}

function isPersonType(value: unknown): value is PersonType {
  return value === 'officiel' || value === 'encadrant' || value === 'accompagnateur';
}

/**
 * Un utilisateur peut cumuler plusieurs rôles terrain, donc plusieurs liens (un par
 * personType). Sans précision, on cible le premier lien — le paramètre personType permet
 * de cibler explicitement l'un des liens quand il y en a plusieurs.
 */
function resolveTargetLink(user: SessionUser, requestedType: PersonType | null) {
  if (requestedType) {
    return user.personLinks.find((link) => link.personType === requestedType) ?? null;
  }
  return user.personLinks[0] ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const requestedType = request.nextUrl.searchParams.get('personType');
  const link = resolveTargetLink(auth.user, isPersonType(requestedType) ? requestedType : null);
  if (!link) return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });

  const db = await getDb();
  const person = await findLinkedPerson(db, link.personType, { personId: link.personId, personNom: link.personNom });
  if (!person) return NextResponse.json({ error: 'Personne liée introuvable' }, { status: 404 });

  return NextResponse.json({ indisponibilites: normalizeIndisponibilites(person.indisponibilites) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const link = resolveTargetLink(auth.user, isPersonType(body.personType) ? body.personType : null);
    if (!link) return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });

    const db = await getDb();
    const person = await findLinkedPerson(db, link.personType, { personId: link.personId, personNom: link.personNom });
    if (!person) return NextResponse.json({ error: 'Personne liée introuvable' }, { status: 404 });

    const indisponibilites = normalizeIndisponibilites(body.indisponibilites);
    person.indisponibilites = indisponibilites;
    await db.getRepository(repositoryName(link.personType)).save(person);

    await notifyAdmins(db, {
      type: 'availability-updated',
      title: 'Indisponibilités mises à jour',
      message: `${auth.user.nom} a mis à jour ses indisponibilités.`,
    });

    return NextResponse.json({ success: true, indisponibilites });
  } catch (error) {
    console.error('Error updating personal availability:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour vos indisponibilités' }, { status: 500 });
  }
}
