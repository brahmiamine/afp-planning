import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OFFICIELS_FILE = path.join(process.cwd(), 'data', 'officiels.json');

interface Officiel {
  nom: string;
  telephone?: string;
}

interface OfficielsData {
  officiels: Officiel[];
}

export async function GET() {
  try {
    if (!fs.existsSync(OFFICIELS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier officiels.json non trouvé' },
        { status: 404 }
      );
    }

    const fileContents = fs.readFileSync(OFFICIELS_FILE, 'utf8');
    const data: OfficielsData = JSON.parse(fileContents);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading officiels.json:', error);
    return NextResponse.json(
      { error: 'Failed to load officiels' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!fs.existsSync(OFFICIELS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier officiels.json non trouvé' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { oldNom, nom, telephone } = body;

    if (!oldNom || typeof oldNom !== 'string' || oldNom.trim() === '') {
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

    // Lire le fichier actuel
    const fileContents = fs.readFileSync(OFFICIELS_FILE, 'utf8');
    const data: OfficielsData = JSON.parse(fileContents);

    // Chercher l'officiel par ancien nom
    const officielIndex = data.officiels.findIndex(
      (o) => o.nom.toLowerCase().trim() === oldNom.toLowerCase().trim()
    );

    if (officielIndex === -1) {
      return NextResponse.json(
        { error: 'Officiel non trouvé' },
        { status: 404 }
      );
    }

    // Vérifier si le nouveau nom existe déjà (sauf si c'est le même officiel)
    if (data.officiels.some((o, idx) => 
      o.nom.toLowerCase().trim() === nom.toLowerCase().trim() && idx !== officielIndex
    )) {
      return NextResponse.json(
        { error: 'Un officiel avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    // Mettre à jour l'officiel
    data.officiels[officielIndex] = {
      nom: nom.trim(),
      telephone: telephone && typeof telephone === 'string' ? telephone.trim() : undefined,
    };

    // Écrire le fichier mis à jour
    fs.writeFileSync(OFFICIELS_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating officiels.json:', error);
    return NextResponse.json(
      { error: 'Failed to update officiels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!fs.existsSync(OFFICIELS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier officiels.json non trouvé' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { nom, telephone } = body;

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom de l\'officiel est requis' },
        { status: 400 }
      );
    }

    // Lire le fichier actuel
    const fileContents = fs.readFileSync(OFFICIELS_FILE, 'utf8');
    const data: OfficielsData = JSON.parse(fileContents);

    // Vérifier si l'officiel existe déjà
    if (data.officiels.some((o) => o.nom.toLowerCase().trim() === nom.toLowerCase().trim())) {
      return NextResponse.json(
        { error: 'Un officiel avec ce nom existe déjà' },
        { status: 400 }
      );
    }

    // Ajouter le nouvel officiel
    data.officiels.push({
      nom: nom.trim(),
      telephone: telephone && typeof telephone === 'string' ? telephone.trim() : undefined,
    });

    // Écrire le fichier mis à jour
    fs.writeFileSync(OFFICIELS_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding officiel:', error);
    return NextResponse.json(
      { error: 'Failed to add officiel' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!fs.existsSync(OFFICIELS_FILE)) {
      return NextResponse.json(
        { error: 'Fichier officiels.json non trouvé' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const nom = searchParams.get('nom');

    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom de l\'officiel est requis' },
        { status: 400 }
      );
    }

    // Lire le fichier actuel
    const fileContents = fs.readFileSync(OFFICIELS_FILE, 'utf8');
    const data: OfficielsData = JSON.parse(fileContents);

    // Chercher et supprimer l'officiel par nom
    const officielIndex = data.officiels.findIndex(
      (o) => o.nom.toLowerCase().trim() === nom.toLowerCase().trim()
    );

    if (officielIndex === -1) {
      return NextResponse.json(
        { error: 'Officiel non trouvé' },
        { status: 404 }
      );
    }

    // Supprimer l'officiel
    data.officiels.splice(officielIndex, 1);

    // Écrire le fichier mis à jour
    fs.writeFileSync(OFFICIELS_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting officiel:', error);
    return NextResponse.json(
      { error: 'Failed to delete officiel' },
      { status: 500 }
    );
  }
}
