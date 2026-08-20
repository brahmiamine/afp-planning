import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeIndisponibilites, type OfficielIndisponibilite } from '@/lib/utils/officiel-availability';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

interface Officiel {
  id?: number;
  nom: string;
  telephone?: string;
  indisponibilites?: OfficielIndisponibilite[];
}

interface OfficielsData {
  officiels: Officiel[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function serialize(item: Record<string, unknown>): Officiel {
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
    const all = await db.getRepository('Officiel').find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ officiels: all.map(serialize) } satisfies OfficielsData);
  } catch (error) {
    console.error('Error reading officiels from DB:', error);
    return NextResponse.json({ error: 'Failed to load officiels' }, { status: 500 });
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
      return NextResponse.json({ error: 'L\'ancien nom de l\'officiel est requis' }, { status: 400 });
    }
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom de l\'officiel est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Officiel');
    const clubId = auth.user.clubId;
    const current = await repo.findOneBy({ nom: targetOldNom, clubId });
    const officiel = current ?? (await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :targetName AND officiel.clubId = :clubId', { targetName: normalize(targetOldNom), clubId })
      .getOne());
    if (!officiel) return NextResponse.json({ error: 'Officiel non trouvé' }, { status: 404 });

    const existingWithSameName = await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :newName AND officiel.clubId = :clubId', { newName: normalize(nom), clubId })
      .getOne();
    if (existingWithSameName && existingWithSameName.id !== officiel.id) {
      return NextResponse.json({ error: 'Un officiel avec ce nom existe déjà' }, { status: 400 });
    }

    officiel.nom = nom.trim();
    officiel.telephone = telephone && typeof telephone === 'string' ? telephone.trim() || null : null;
    if (Object.prototype.hasOwnProperty.call(body, 'indisponibilites')) {
      const normalized = normalizeIndisponibilites(indisponibilites);
      officiel.indisponibilites = normalized.length > 0 ? normalized : null;
    }
    await repo.save(officiel);

    const all = await repo.find({ where: { clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { officiels: all.map(serialize) } satisfies OfficielsData });
  } catch (error) {
    console.error('Error updating officiels in DB:', error);
    return NextResponse.json({ error: 'Failed to update officiels' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { nom, telephone, indisponibilites } = body;
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom de l\'officiel est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Officiel');
    const clubId = auth.user.clubId;
    const existing = await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :normalizedNom AND officiel.clubId = :clubId', { normalizedNom: normalize(nom), clubId })
      .getOne();
    if (existing) return NextResponse.json({ error: 'Un officiel avec ce nom existe déjà' }, { status: 400 });

    const normalized = normalizeIndisponibilites(indisponibilites);
    await repo.save({
      clubId,
      nom: nom.trim(),
      telephone: telephone && typeof telephone === 'string' ? telephone.trim() || null : null,
      indisponibilites: normalized.length > 0 ? normalized : null,
    });

    const all = await repo.find({ where: { clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { officiels: all.map(serialize) } satisfies OfficielsData });
  } catch (error) {
    console.error('Error adding officiel in DB:', error);
    return NextResponse.json({ error: 'Failed to add officiel' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');
    if (!nom || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom de l\'officiel est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Officiel');
    const clubId = auth.user.clubId;
    const officiel = await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :normalizedNom AND officiel.clubId = :clubId', { normalizedNom: normalize(nom), clubId })
      .getOne();
    if (!officiel) return NextResponse.json({ error: 'Officiel non trouvé' }, { status: 404 });

    await repo.remove(officiel);
    const all = await repo.find({ where: { clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { officiels: all.map(serialize) } satisfies OfficielsData });
  } catch (error) {
    console.error('Error deleting officiel in DB:', error);
    return NextResponse.json({ error: 'Failed to delete officiel' }, { status: 500 });
  }
}
