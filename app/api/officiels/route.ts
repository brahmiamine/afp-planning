import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeIndisponibilites, type OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

interface Officiel {
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

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('Officiel');
    const all = await repo.find({ order: { nom: 'ASC' } });
    const data: OfficielsData = {
      officiels: all.map((item) => ({
        nom: String(item.nom),
        telephone: item.telephone ? String(item.telephone) : undefined,
        indisponibilites: normalizeIndisponibilites(item.indisponibilites),
      })),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading officiels from DB:', error);
    return NextResponse.json(
      { error: 'Failed to load officiels' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldNom, nom, telephone, indisponibilites } = body;

    const targetOldNom = oldNom && typeof oldNom === 'string' ? oldNom : nom;

    if (!targetOldNom || typeof targetOldNom !== 'string' || targetOldNom.trim() === '') {
      return NextResponse.json(
        { error: 'L\'ancien nom de l\'officiel est requis' },
        { status: 400 }
      );
    }

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom de l\'officiel est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Officiel');

    const current = await repo.findOneBy({
      nom: targetOldNom,
    });

    const officiel = current ?? (await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :targetName', { targetName: normalize(targetOldNom) })
      .getOne());

    if (!officiel) {
      return NextResponse.json(
        { error: 'Officiel non trouvé' },
        { status: 404 }
      );
    }

    const existingWithSameName = await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :newName', { newName: normalize(nom) })
      .getOne();

    if (existingWithSameName && existingWithSameName.id !== officiel.id) {
      return NextResponse.json(
        { error: 'Un officiel avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    officiel.nom = nom.trim();
    officiel.telephone = telephone && typeof telephone === 'string'
      ? telephone.trim() || null
      : null;
    if (Object.prototype.hasOwnProperty.call(body, 'indisponibilites')) {
      const normalizedIndisponibilites = normalizeIndisponibilites(indisponibilites);
      officiel.indisponibilites = normalizedIndisponibilites.length > 0 ? normalizedIndisponibilites : null;
    }

    await repo.save(officiel);

    const all = await repo.find({ order: { nom: 'ASC' } });
    const data: OfficielsData = {
      officiels: all.map((item) => ({
        nom: String(item.nom),
        telephone: item.telephone ? String(item.telephone) : undefined,
        indisponibilites: normalizeIndisponibilites(item.indisponibilites),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating officiels in DB:', error);
    return NextResponse.json(
      { error: 'Failed to update officiels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nom, telephone, indisponibilites } = body;

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom de l\'officiel est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Officiel');

    const existing = await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (existing) {
      return NextResponse.json(
        { error: 'Un officiel avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    const normalizedIndisponibilites = normalizeIndisponibilites(indisponibilites);

    await repo.save({
      nom: nom.trim(),
      telephone: telephone && typeof telephone === 'string' ? telephone.trim() || null : null,
      indisponibilites: normalizedIndisponibilites.length > 0 ? normalizedIndisponibilites : null,
    });

    const all = await repo.find({ order: { nom: 'ASC' } });
    const data: OfficielsData = {
      officiels: all.map((item) => ({
        nom: String(item.nom),
        telephone: item.telephone ? String(item.telephone) : undefined,
        indisponibilites: normalizeIndisponibilites(item.indisponibilites),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding officiel in DB:', error);
    return NextResponse.json(
      { error: 'Failed to add officiel' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom de l\'officiel est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Officiel');

    const officiel = await repo
      .createQueryBuilder('officiel')
      .where('LOWER(officiel.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (!officiel) {
      return NextResponse.json(
        { error: 'Officiel non trouvé' },
        { status: 404 }
      );
    }

    await repo.remove(officiel);

    const all = await repo.find({ order: { nom: 'ASC' } });
    const data: OfficielsData = {
      officiels: all.map((item) => ({
        nom: String(item.nom),
        telephone: item.telephone ? String(item.telephone) : undefined,
        indisponibilites: normalizeIndisponibilites(item.indisponibilites),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting officiel in DB:', error);
    return NextResponse.json(
      { error: 'Failed to delete officiel' },
      { status: 500 }
    );
  }
}
