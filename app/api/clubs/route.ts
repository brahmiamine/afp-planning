import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export interface Club {
  nom: string;
  logo: string;
}

export interface ClubsData {
  clubs: Club[];
}

const CLUBS_FILE = path.join(process.cwd(), 'data', 'clubs.json');

export async function GET() {
  try {
    if (!fs.existsSync(CLUBS_FILE)) {
      return NextResponse.json({ clubs: [] } as ClubsData);
    }
    const fileContents = fs.readFileSync(CLUBS_FILE, 'utf8');
    const clubs: Club[] = JSON.parse(fileContents);
    
    return NextResponse.json({ clubs });
  } catch (error) {
    console.error('Error reading clubs.json:', error);
    return NextResponse.json(
      { error: 'Failed to load clubs' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!fs.existsSync(CLUBS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier clubs.json non trouvé' },
        { status: 404 }
      );
    }

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

    const fileContents = fs.readFileSync(CLUBS_FILE, 'utf8');
    const clubs: Club[] = JSON.parse(fileContents);

    const clubIndex = clubs.findIndex(
      (c) => c.nom.toLowerCase().trim() === oldNom.toLowerCase().trim()
    );

    if (clubIndex === -1) {
      return NextResponse.json(
        { error: 'Club non trouvé' },
        { status: 404 }
      );
    }

    // Vérifier si le nouveau nom existe déjà (sauf si c'est le même club)
    if (clubs.some((c, idx) => 
      c.nom.toLowerCase().trim() === nom.toLowerCase().trim() && idx !== clubIndex
    )) {
      return NextResponse.json(
        { error: 'Un club avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    clubs[clubIndex] = {
      nom: nom.trim(),
      logo: logo.trim(),
    };

    fs.writeFileSync(CLUBS_FILE, JSON.stringify(clubs, null, 2), 'utf8');

    return NextResponse.json({ success: true, clubs });
  } catch (error) {
    console.error('Error updating clubs.json:', error);
    return NextResponse.json(
      { error: 'Failed to update club' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!fs.existsSync(CLUBS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier clubs.json non trouvé' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du club est requis' },
        { status: 400 }
      );
    }

    const fileContents = fs.readFileSync(CLUBS_FILE, 'utf8');
    const clubs: Club[] = JSON.parse(fileContents);

    const clubIndex = clubs.findIndex(
      (c) => c.nom.toLowerCase().trim() === nom.toLowerCase().trim()
    );

    if (clubIndex === -1) {
      return NextResponse.json(
        { error: 'Club non trouvé' },
        { status: 404 }
      );
    }

    clubs.splice(clubIndex, 1);

    fs.writeFileSync(CLUBS_FILE, JSON.stringify(clubs, null, 2), 'utf8');

    return NextResponse.json({ success: true, clubs });
  } catch (error) {
    console.error('Error deleting club:', error);
    return NextResponse.json(
      { error: 'Failed to delete club' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!fs.existsSync(CLUBS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier clubs.json non trouvé' },
        { status: 404 }
      );
    }

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

    const fileContents = fs.readFileSync(CLUBS_FILE, 'utf8');
    const clubs: Club[] = JSON.parse(fileContents);

    // Vérifier si le club existe déjà
    if (clubs.some((c) => c.nom.toLowerCase().trim() === nom.toLowerCase().trim())) {
      return NextResponse.json(
        { error: 'Un club avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    clubs.push({
      nom: nom.trim(),
      logo: logo.trim(),
    });

    fs.writeFileSync(CLUBS_FILE, JSON.stringify(clubs, null, 2), 'utf8');

    return NextResponse.json({ success: true, clubs });
  } catch (error) {
    console.error('Error adding club:', error);
    return NextResponse.json(
      { error: 'Failed to add club' },
      { status: 500 }
    );
  }
}
