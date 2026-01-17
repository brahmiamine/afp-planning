import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EXTRAS_FILE = path.join(process.cwd(), 'matches-extras.json');

// Interface pour les informations supplémentaires d'un match
interface MatchExtras {
  id: string;
  arbitreTouche?: string;
  contactEncadrants?: {
    nom: string;
    numero: string;
  };
  contactAccompagnateur?: {
    nom: string;
    numero: string;
  };
}

// Lire les informations supplémentaires
function readExtras(): Record<string, MatchExtras> {
  try {
    if (fs.existsSync(EXTRAS_FILE)) {
      const content = fs.readFileSync(EXTRAS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Erreur lors de la lecture des extras:', error);
  }
  return {};
}

// Écrire les informations supplémentaires
function writeExtras(extras: Record<string, MatchExtras>) {
  try {
    fs.writeFileSync(EXTRAS_FILE, JSON.stringify(extras, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'écriture des extras:', error);
    return false;
  }
}

// GET: Récupérer les informations supplémentaires d'un match
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Next.js 15+ utilise Promise pour params, on doit await si c'est une Promise
    const resolvedParams = params instanceof Promise ? await params : params;
    const matchId = resolvedParams.id;
    
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json(
        { error: 'ID de match invalide' },
        { status: 400 }
      );
    }

    const extras = readExtras();
    const matchExtras = extras[matchId] || null;
    
    return NextResponse.json(matchExtras);
  } catch (error) {
    console.error('Erreur GET match extras:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des informations' },
      { status: 500 }
    );
  }
}

// PUT: Modifier les informations supplémentaires d'un match
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Next.js 15+ utilise Promise pour params, on doit await si c'est une Promise
    const resolvedParams = params instanceof Promise ? await params : params;
    
    // Valider que l'ID est présent et valide
    const matchId = resolvedParams.id;
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json(
        { error: 'ID de match invalide' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Valider les données - utiliser l'ID de l'URL comme source de vérité
    const extras: MatchExtras = {
      id: matchId, // Toujours utiliser l'ID de l'URL (params.id)
      arbitreTouche: body.arbitreTouche && body.arbitreTouche.trim() !== '' 
        ? body.arbitreTouche.trim() 
        : undefined,
      contactEncadrants: body.contactEncadrants?.nom && body.contactEncadrants?.nom.trim() !== '' && 
                         body.contactEncadrants?.numero && body.contactEncadrants?.numero.trim() !== ''
        ? {
            nom: body.contactEncadrants.nom.trim(),
            numero: body.contactEncadrants.numero.trim(),
          }
        : undefined,
      contactAccompagnateur: body.contactAccompagnateur?.nom && body.contactAccompagnateur?.nom.trim() !== '' && 
                             body.contactAccompagnateur?.numero && body.contactAccompagnateur?.numero.trim() !== ''
        ? {
            nom: body.contactAccompagnateur.nom.trim(),
            numero: body.contactAccompagnateur.numero.trim(),
          }
        : undefined,
    };
    
    // Lire les extras existants
    const allExtras = readExtras();
    
    // Mettre à jour les extras pour ce match (utiliser matchId comme clé)
    allExtras[matchId] = extras;
    
    // Écrire dans le fichier
    if (writeExtras(allExtras)) {
      return NextResponse.json({ success: true, extras });
    } else {
      return NextResponse.json(
        { error: 'Erreur lors de la sauvegarde' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Erreur PUT match extras:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la modification des informations' },
      { status: 500 }
    );
  }
}
