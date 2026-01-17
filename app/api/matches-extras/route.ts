import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EXTRAS_FILE = path.join(process.cwd(), 'matches-extras.json');

// Interface pour les informations supplémentaires d'un match
interface MatchExtras {
  id: string;
  arbitreTouche?: {
    nom: string;
    numero: string;
  };
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

// GET: Récupérer toutes les informations supplémentaires
export async function GET() {
  try {
    const extras = readExtras();
    return NextResponse.json(extras);
  } catch (error) {
    console.error('Erreur GET all match extras:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des informations' },
      { status: 500 }
    );
  }
}
