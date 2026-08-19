import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

export interface Club {
  nom: string;
  logo: string;
}

export interface ClubsData {
  clubs: Club[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('Club');
    const rows = await repo.find({ order: { nom: 'ASC' } });
    const clubs: Club[] = rows.map((club) => ({ nom: String(club.nom), logo: String(club.logo) }));

    return NextResponse.json({ clubs });
  } catch (error) {
    console.error('Error reading clubs from DB:', error);
    return NextResponse.json(
      { error: 'Failed to load clubs' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { oldNom, nom, logo } = body;

    if (!oldNom || typeof oldNom !== 'string' || oldNom.trim() === '') {
      return NextResponse.json(
        { error: 'L\'ancien nom du club est requis' },
        { status: 400 }
      );
    }

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du club est requis' },
        { status: 400 }
      );
    }

    if (!logo || typeof logo !== 'string' || logo.trim() === '') {
      return NextResponse.json(
        { error: 'Le logo du club est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Club');

    const club = await repo
      .createQueryBuilder('club')
      .where('LOWER(club.nom) = :normalizedOldNom', { normalizedOldNom: normalize(oldNom) })
      .getOne();

    if (!club) {
      return NextResponse.json(
        { error: 'Club non trouvé' },
        { status: 404 }
      );
    }

    const existing = await repo
      .createQueryBuilder('club')
      .where('LOWER(club.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (existing && existing.id !== club.id) {
      return NextResponse.json(
        { error: 'Un club avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    club.nom = nom.trim();
    club.logo = logo.trim();

    await repo.save(club);

    const clubs = (await repo.find({ order: { nom: 'ASC' } })).map((item) => ({
      nom: String(item.nom),
      logo: String(item.logo),
    }));

    return NextResponse.json({ success: true, clubs });
  } catch (error) {
    console.error('Error updating clubs in DB:', error);
    return NextResponse.json(
      { error: 'Failed to update club' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du club est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Club');
    const club = await repo
      .createQueryBuilder('club')
      .where('LOWER(club.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (!club) {
      return NextResponse.json(
        { error: 'Club non trouvé' },
        { status: 404 }
      );
    }

    await repo.remove(club);

    const clubs = (await repo.find({ order: { nom: 'ASC' } })).map((item) => ({
      nom: String(item.nom),
      logo: String(item.logo),
    }));

    return NextResponse.json({ success: true, clubs });
  } catch (error) {
    console.error('Error deleting club in DB:', error);
    return NextResponse.json(
      { error: 'Failed to delete club' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { nom, logo } = body;

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du club est requis' },
        { status: 400 }
      );
    }

    if (!logo || typeof logo !== 'string' || logo.trim() === '') {
      return NextResponse.json(
        { error: 'Le logo du club est requis' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Club');

    const existing = await repo
      .createQueryBuilder('club')
      .where('LOWER(club.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
      .getOne();

    if (existing) {
      return NextResponse.json(
        { error: 'Un club avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    await repo.save({
      nom: nom.trim(),
      logo: logo.trim(),
    });

    const clubs = (await repo.find({ order: { nom: 'ASC' } })).map((item) => ({
      nom: String(item.nom),
      logo: String(item.logo),
    }));

    return NextResponse.json({ success: true, clubs });
  } catch (error) {
    console.error('Error adding club in DB:', error);
    return NextResponse.json(
      { error: 'Failed to add club' },
      { status: 500 }
    );
  }
}
