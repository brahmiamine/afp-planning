import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export interface Stade {
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
}

export interface StadesData {
  stades: Stade[];
}

const STADES_FILE = path.join(process.cwd(), 'stades.json');

export async function GET() {
  try {
    if (!fs.existsSync(STADES_FILE)) {
      return NextResponse.json({ stades: [] } as StadesData);
    }
    const fileContents = fs.readFileSync(STADES_FILE, 'utf8');
    const data: StadesData = JSON.parse(fileContents);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading stades.json:', error);
    return NextResponse.json(
      { error: 'Failed to load stades' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!fs.existsSync(STADES_FILE)) {
      return NextResponse.json(
        { error: 'Fichier stades.json non trouvé' },
        { status: 404 }
      );
    }

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

    const fileContents = fs.readFileSync(STADES_FILE, 'utf8');
    const data: StadesData = JSON.parse(fileContents);

    const stadeIndex = data.stades.findIndex(
      (s) => s.nom.toLowerCase().trim() === oldNom.toLowerCase().trim()
    );

    if (stadeIndex === -1) {
      return NextResponse.json(
        { error: 'Stade non trouvé' },
        { status: 404 }
      );
    }

    // Vérifier si le nouveau nom existe déjà (sauf si c'est le même stade)
    if (data.stades.some((s, idx) => 
      s.nom.toLowerCase().trim() === nom.toLowerCase().trim() && idx !== stadeIndex
    )) {
      return NextResponse.json(
        { error: 'Un stade avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    data.stades[stadeIndex] = {
      nom: nom.trim(),
      adresse: adresse && typeof adresse === 'string' ? adresse.trim() || null : null,
      googleMapsUrl: googleMapsUrl.trim(),
    };

    fs.writeFileSync(STADES_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating stades.json:', error);
    return NextResponse.json(
      { error: 'Failed to update stade' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!fs.existsSync(STADES_FILE)) {
      return NextResponse.json(
        { error: 'Fichier stades.json non trouvé' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom du stade est requis' },
        { status: 400 }
      );
    }

    const fileContents = fs.readFileSync(STADES_FILE, 'utf8');
    const data: StadesData = JSON.parse(fileContents);

    const stadeIndex = data.stades.findIndex(
      (s) => s.nom.toLowerCase().trim() === nom.toLowerCase().trim()
    );

    if (stadeIndex === -1) {
      return NextResponse.json(
        { error: 'Stade non trouvé' },
        { status: 404 }
      );
    }

    data.stades.splice(stadeIndex, 1);

    fs.writeFileSync(STADES_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting stade:', error);
    return NextResponse.json(
      { error: 'Failed to delete stade' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!fs.existsSync(STADES_FILE)) {
      return NextResponse.json(
        { error: 'Fichier stades.json non trouvé' },
        { status: 404 }
      );
    }

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

    const fileContents = fs.readFileSync(STADES_FILE, 'utf8');
    const data: StadesData = JSON.parse(fileContents);

    // Vérifier si le stade existe déjà
    if (data.stades.some((s) => s.nom.toLowerCase().trim() === nom.toLowerCase().trim())) {
      return NextResponse.json(
        { error: 'Un stade avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    data.stades.push({
      nom: nom.trim(),
      adresse: adresse && typeof adresse === 'string' ? adresse.trim() || null : null,
      googleMapsUrl: googleMapsUrl.trim(),
    });

    fs.writeFileSync(STADES_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding stade:', error);
    return NextResponse.json(
      { error: 'Failed to add stade' },
      { status: 500 }
    );
  }
}
