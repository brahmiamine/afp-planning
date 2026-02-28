import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export interface Stade {
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
}

export interface StadesData {
  stades: Stade[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('Stade');
    const rows = await repo.find({ order: { nom: 'ASC' } });
    const data: StadesData = {
      stades: rows.map((stade) => ({
        nom: String(stade.nom),
        adresse: stade.adresse ? String(stade.adresse) : null,
        googleMapsUrl: String(stade.googleMapsUrl),
      })),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading stades from DB:', error);
    return NextResponse.json(
      { error: 'Failed to load stades' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldNom, nom, adresse, googleMapsUrl } = body;

    if (!oldNom || typeof oldNom !== 'string' || oldNom.trim() === '') {
      return NextResponse.json(
        { error: 'L\'ancien nom du stade est requis' },
        { status: 400 }
      );
    }

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du stade est requis' },
        { status: 400 }
      );
    }

    if (!googleMapsUrl || typeof googleMapsUrl !== 'string' || googleMapsUrl.trim() === '') {
      return NextResponse.json(
        { error: 'L\'URL Google Maps est requise' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Stade');

    const stade = await repo
      .createQueryBuilder('stade')
      .where('LOWER(stade.nom) = :normalizedOldNom', { normalizedOldNom: normalize(oldNom) })
      .getOne();

    if (!stade) {
      return NextResponse.json(
        { error: 'Stade non trouvé' },
        { status: 404 }
      );
    }

    const existing = await repo
      .createQueryBuilder('stade')
      .where('LOWER(stade.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (existing && existing.id !== stade.id) {
      return NextResponse.json(
        { error: 'Un stade avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    stade.nom = nom.trim();
    stade.adresse = adresse && typeof adresse === 'string' ? adresse.trim() || null : null;
    stade.googleMapsUrl = googleMapsUrl.trim();

    await repo.save(stade);

    const data: StadesData = {
      stades: (await repo.find({ order: { nom: 'ASC' } })).map((item) => ({
        nom: String(item.nom),
        adresse: item.adresse ? String(item.adresse) : null,
        googleMapsUrl: String(item.googleMapsUrl),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating stades in DB:', error);
    return NextResponse.json(
      { error: 'Failed to update stade' },
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
        { error: 'Le nom du stade est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Stade');

    const stade = await repo
      .createQueryBuilder('stade')
      .where('LOWER(stade.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (!stade) {
      return NextResponse.json(
        { error: 'Stade non trouvé' },
        { status: 404 }
      );
    }

    await repo.remove(stade);

    const data: StadesData = {
      stades: (await repo.find({ order: { nom: 'ASC' } })).map((item) => ({
        nom: String(item.nom),
        adresse: item.adresse ? String(item.adresse) : null,
        googleMapsUrl: String(item.googleMapsUrl),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting stade in DB:', error);
    return NextResponse.json(
      { error: 'Failed to delete stade' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nom, adresse, googleMapsUrl } = body;

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du stade est requis' },
        { status: 400 }
      );
    }

    if (!googleMapsUrl || typeof googleMapsUrl !== 'string' || googleMapsUrl.trim() === '') {
      return NextResponse.json(
        { error: 'L\'URL Google Maps est requise' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Stade');

    const existing = await repo
      .createQueryBuilder('stade')
      .where('LOWER(stade.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (existing) {
      return NextResponse.json(
        { error: 'Un stade avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    await repo.save({
      nom: nom.trim(),
      adresse: adresse && typeof adresse === 'string' ? adresse.trim() || null : null,
      googleMapsUrl: googleMapsUrl.trim(),
    });

    const data: StadesData = {
      stades: (await repo.find({ order: { nom: 'ASC' } })).map((item) => ({
        nom: String(item.nom),
        adresse: item.adresse ? String(item.adresse) : null,
        googleMapsUrl: String(item.googleMapsUrl),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding stade in DB:', error);
    return NextResponse.json(
      { error: 'Failed to add stade' },
      { status: 500 }
    );
  }
}
