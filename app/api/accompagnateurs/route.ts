import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeIndisponibilites, type OfficielIndisponibilite } from '@/lib/utils/officiel-availability';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

interface Accompagnateur {
  id?: number;
  nom: string;
  telephone?: string;
  indisponibilites?: OfficielIndisponibilite[];
}

interface AccompagnateursData {
  accompagnateurs: Accompagnateur[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function serialize(item: Record<string, unknown>): Accompagnateur {
  return {
    id: typeof item.id === 'number' ? item.id : undefined,
    nom: String(item.nom),
    telephone: item.telephone ? String(item.telephone) : undefined,
    indisponibilites: normalizeIndisponibilites(item.indisponibilites),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const all = await db.getRepository('Accompagnateur').find({ order: { nom: 'ASC' } });
    return NextResponse.json({ accompagnateurs: all.map(serialize) } satisfies AccompagnateursData);
  } catch (error) {
    console.error('Error reading accompagnateurs from DB:', error);
    return NextResponse.json({ error: 'Failed to load accompagnateurs' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { oldNom, nom, telephone, indisponibilites } = body;
    const targetOldNom = oldNom && typeof oldNom === 'string' ? oldNom : nom;

    if (!targetOldNom || typeof targetOldNom !== 'string' || targetOldNom.trim() === '') {
      return NextResponse.json({ error: 'L\'ancien nom de l\'accompagnateur est requis' }, { status: 400 });
    }
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom de l\'accompagnateur est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Accompagnateur');
    const current = await repo.findOneBy({ nom: targetOldNom });
    const accompagnateur = current ?? (await repo
      .createQueryBuilder('accompagnateur')
      .where('LOWER(accompagnateur.nom) = :targetName', { targetName: normalize(targetOldNom) })
      .getOne());
    if (!accompagnateur) return NextResponse.json({ error: 'Accompagnateur non trouvé' }, { status: 404 });

    const existingWithSameName = await repo
      .createQueryBuilder('accompagnateur')
      .where('LOWER(accompagnateur.nom) = :newName', { newName: normalize(nom) })
      .getOne();
    if (existingWithSameName && existingWithSameName.id !== accompagnateur.id) {
      return NextResponse.json({ error: 'Un accompagnateur avec ce nom existe déjà' }, { status: 400 });
    }

    accompagnateur.nom = nom.trim();
    accompagnateur.telephone = telephone && typeof telephone === 'string' ? telephone.trim() || null : null;
    if (Object.prototype.hasOwnProperty.call(body, 'indisponibilites')) {
      const normalized = normalizeIndisponibilites(indisponibilites);
      accompagnateur.indisponibilites = normalized.length > 0 ? normalized : null;
    }
    await repo.save(accompagnateur);

    const all = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { accompagnateurs: all.map(serialize) } satisfies AccompagnateursData });
  } catch (error) {
    console.error('Error updating accompagnateurs in DB:', error);
    return NextResponse.json({ error: 'Failed to update accompagnateurs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { nom, telephone, indisponibilites } = body;
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom de l\'accompagnateur est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Accompagnateur');
    const existing = await repo
      .createQueryBuilder('accompagnateur')
      .where('LOWER(accompagnateur.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();
    if (existing) return NextResponse.json({ error: 'Un accompagnateur avec ce nom existe déjà' }, { status: 400 });

    const normalized = normalizeIndisponibilites(indisponibilites);
    await repo.save({
      nom: nom.trim(),
      telephone: telephone && typeof telephone === 'string' ? telephone.trim() || null : null,
      indisponibilites: normalized.length > 0 ? normalized : null,
    });

    const all = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { accompagnateurs: all.map(serialize) } satisfies AccompagnateursData });
  } catch (error) {
    console.error('Error adding accompagnateur in DB:', error);
    return NextResponse.json({ error: 'Failed to add accompagnateur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');
    if (!nom || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom de l\'accompagnateur est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Accompagnateur');
    const accompagnateur = await repo
      .createQueryBuilder('accompagnateur')
      .where('LOWER(accompagnateur.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();
    if (!accompagnateur) return NextResponse.json({ error: 'Accompagnateur non trouvé' }, { status: 404 });

    await repo.remove(accompagnateur);
    const all = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { accompagnateurs: all.map(serialize) } satisfies AccompagnateursData });
  } catch (error) {
    console.error('Error deleting accompagnateur in DB:', error);
    return NextResponse.json({ error: 'Failed to delete accompagnateur' }, { status: 500 });
  }
}
