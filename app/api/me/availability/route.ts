import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { isReadOnlyRole } from '@/lib/auth/roles';
import { findLinkedPerson } from '@/lib/planning/person-link';
import { normalizeIndisponibilites } from '@/lib/utils/officiel-availability';
import { notifyAdmins } from '@/lib/notifications/service';

function repositoryName(personType: 'officiel' | 'encadrant' | 'accompagnateur') {
  if (personType === 'officiel') return 'Officiel';
  if (personType === 'encadrant') return 'Encadrant';
  return 'Accompagnateur';
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.role) || !auth.user.personType) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const db = await getDb();
  const person = await findLinkedPerson(db, auth.user.personType, {
    personId: auth.user.personId,
    personNom: auth.user.personNom,
  });
  if (!person) return NextResponse.json({ error: 'Personne liée introuvable' }, { status: 404 });

  return NextResponse.json({ indisponibilites: normalizeIndisponibilites(person.indisponibilites) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.role) || !auth.user.personType) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const db = await getDb();
    const person = await findLinkedPerson(db, auth.user.personType, {
      personId: auth.user.personId,
      personNom: auth.user.personNom,
    });
    if (!person) return NextResponse.json({ error: 'Personne liée introuvable' }, { status: 404 });

    const indisponibilites = normalizeIndisponibilites(body.indisponibilites);
    person.indisponibilites = indisponibilites;
    await db.getRepository(repositoryName(auth.user.personType)).save(person);

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
